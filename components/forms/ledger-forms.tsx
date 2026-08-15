"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { createTreatmentCharge, recordPayment } from "@/lib/actions/payment.actions";
import {
  paymentSchema,
  treatmentChargeSchema,
  type PaymentInput,
  type TreatmentChargeInput
} from "@/lib/validation";
import { paymentMethods } from "@/constants";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function TreatmentChargeForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<TreatmentChargeInput>({
    resolver: zodResolver(treatmentChargeSchema),
    defaultValues: {
      patientId,
      description: "",
      amount: "",
      serviceDate: new Date().toISOString().slice(0, 10),
      status: "OPEN",
      notes: ""
    }
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          await createTreatmentCharge(values);
          form.reset({ ...values, description: "", amount: "", notes: "" });
          router.refresh();
        });
      })}
    >
      <input type="hidden" {...form.register("patientId")} />
      <Field label="Tratamiento" error={form.formState.errors.description?.message}>
        <Input {...form.register("description")} />
      </Field>
      <Field label="Monto" error={form.formState.errors.amount?.message}>
        <Input inputMode="decimal" {...form.register("amount")} />
      </Field>
      <Field label="Fecha" error={form.formState.errors.serviceDate?.message}>
        <Input type="date" {...form.register("serviceDate")} />
      </Field>
      <Field label="Estado" error={form.formState.errors.status?.message}>
        <Select {...form.register("status")}>
          <option value="OPEN">Abierto</option>
          <option value="PAID">Pagado</option>
          <option value="VOID">Anulado</option>
        </Select>
      </Field>
      <Field label="Notas" error={form.formState.errors.notes?.message} className="md:col-span-2">
        <Textarea {...form.register("notes")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Agregar cargo"}
        </Button>
      </div>
    </form>
  );
}

export function PaymentForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      patientId,
      amount: "",
      paidAt: new Date().toISOString().slice(0, 10),
      method: "Efectivo",
      status: "CONFIRMED",
      notes: ""
    }
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          await recordPayment(values);
          form.reset({ ...values, amount: "", notes: "" });
          router.refresh();
        });
      })}
    >
      <input type="hidden" {...form.register("patientId")} />
      <Field label="Monto" error={form.formState.errors.amount?.message}>
        <Input inputMode="decimal" {...form.register("amount")} />
      </Field>
      <Field label="Fecha" error={form.formState.errors.paidAt?.message}>
        <Input type="date" {...form.register("paidAt")} />
      </Field>
      <Field label="Método" error={form.formState.errors.method?.message}>
        <Select {...form.register("method")}>
          {paymentMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Estado" error={form.formState.errors.status?.message}>
        <Select {...form.register("status")}>
          <option value="CONFIRMED">Confirmado</option>
          <option value="PENDING">Pendiente</option>
          <option value="VOID">Anulado</option>
        </Select>
      </Field>
      <Field label="Notas" error={form.formState.errors.notes?.message} className="md:col-span-2">
        <Textarea {...form.register("notes")} />
      </Field>
      <div className="md:col-span-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}
