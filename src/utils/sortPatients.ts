import type { PatientEntry } from "../types";

export function parseRoomBed(room: string | null): { roomNum: number; bedNum: number } {
  if (!room) return { roomNum: Infinity, bedNum: Infinity };
  const match = room.match(/^(\d+)[\/\-](\d+)$/);
  if (match) return { roomNum: parseInt(match[1], 10), bedNum: parseInt(match[2], 10) };
  const num = parseInt(room, 10);
  return { roomNum: isNaN(num) ? Infinity : num, bedNum: 0 };
}

export function comparePatientsByRoom(a: PatientEntry, b: PatientEntry): number {
  const ar = parseRoomBed(a.room);
  const br = parseRoomBed(b.room);
  if (ar.roomNum !== br.roomNum) return ar.roomNum - br.roomNum;
  if (ar.bedNum !== br.bedNum) return ar.bedNum - br.bedNum;
  return (a.order ?? 0) - (b.order ?? 0);
}
