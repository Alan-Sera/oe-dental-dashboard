import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { importPatientsRoot } from "@/lib/actions/import.actions";
import { ensureDataDirectories } from "@/lib/local-paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await requireSession();
  await ensureDataDirectories();

  const body = await request.json();
  try {
    const batch = await importPatientsRoot(body);

    return NextResponse.json({ batch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo vincular la carpeta local" },
      { status: 400 }
    );
  }
}
