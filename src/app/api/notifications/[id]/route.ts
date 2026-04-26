import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { is_read } = await req.json();
  const supabase = createServerClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
