import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { APP_CONFIG } from "@/config/app-config";

export async function GET() {
  try {
    const logs = await prisma.safetyTriggerLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      devLogTextEnabled: APP_CONFIG.logging.shouldLogAnswerText(),
      logs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch trigger logs",
      },
      { status: 500 }
    );
  }
}
