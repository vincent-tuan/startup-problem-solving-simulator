"use client";
import { useEffect } from "react";

export function SessionHeartbeat() {
  useEffect(() => { void fetch("/api/v1/session/refresh", { method: "POST" }); }, []);
  return null;
}
