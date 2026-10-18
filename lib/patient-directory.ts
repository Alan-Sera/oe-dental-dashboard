import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getUpcomingAppointmentWhere } from "@/lib/upcoming-appointments";

const PHOTO_LOOKUP_BATCH_SIZE = 500;

export async function assignMissingProfilePhotos(db: PrismaClient = prisma) {
  const patients = await db.patient.findMany({
    where: { profilePhotoId: null, attachments: { some: { category: "PHOTO" } } },
    select: {
      id: true,
      attachments: {
        where: { category: "PHOTO" },
        orderBy: { importedAt: "asc" },
        take: 1,
        select: { id: true }
      }
    }
  });

  let updated = 0;
  for (const patient of patients) {
    const firstPhoto = patient.attachments[0];
    if (!firstPhoto) continue;
    const result = await db.patient.updateMany({
      where: { id: patient.id, profilePhotoId: null },
      data: { profilePhotoId: firstPhoto.id }
    });
    updated += result.count;
  }
  return { updated };
}

export async function listPatientDirectory(db: PrismaClient = prisma, asOf = new Date()) {
  const [patients, chargeTotals, paymentTotals] = await Promise.all([
    db.patient.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        gender: true,
        updatedAt: true,
        profilePhotoId: true,
        appointments: {
          where: getUpcomingAppointmentWhere(asOf),
          orderBy: { startTime: "asc" },
          take: 1,
          select: { id: true, startTime: true }
        }
      }
    }),
    db.treatmentCharge.groupBy({
      by: ["patientId"],
      where: { status: { not: "VOID" } },
      _sum: { amountCents: true }
    }),
    db.payment.groupBy({
      by: ["patientId"],
      where: { status: "CONFIRMED" },
      _sum: { amountCents: true }
    })
  ]);

  if (!patients.length) return [];

  const balances = new Map<string, number>();
  for (const charge of chargeTotals) {
    balances.set(charge.patientId, charge._sum.amountCents ?? 0);
  }
  for (const payment of paymentTotals) {
    balances.set(payment.patientId, (balances.get(payment.patientId) ?? 0) - (payment._sum.amountCents ?? 0));
  }

  const photoIds = patients.flatMap((patient) => patient.profilePhotoId ? [patient.profilePhotoId] : []);
  const photos = new Map<string, { patientId: string; sourceModifiedAt: Date | null }>();
  for (let offset = 0; offset < photoIds.length; offset += PHOTO_LOOKUP_BATCH_SIZE) {
    const batch = await db.attachment.findMany({
      where: { id: { in: photoIds.slice(offset, offset + PHOTO_LOOKUP_BATCH_SIZE) } },
      select: { id: true, patientId: true, sourceModifiedAt: true }
    });
    for (const photo of batch) photos.set(photo.id, photo);
  }

  return patients.map((patient) => {
    const nextAppointment = patient.appointments[0] ?? null;
    const profilePhoto = patient.profilePhotoId ? photos.get(patient.profilePhotoId) : null;
    return {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      email: patient.email,
      gender: patient.gender,
      nextAppointmentDate: nextAppointment?.startTime.toISOString() ?? null,
      nextAppointmentId: nextAppointment?.id ?? null,
      balanceCents: balances.get(patient.id) ?? 0,
      updatedAt: patient.updatedAt.toISOString(),
      photoAttachmentId: patient.profilePhotoId,
      photoVersion: profilePhoto?.patientId === patient.id
        ? profilePhoto.sourceModifiedAt?.toISOString() ?? null
        : null
    };
  });
}
