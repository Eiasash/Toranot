export {
  SECTIONS,
  PATIENT_SECTIONS,
  SECTION_LABEL,
  UNKNOWN_SECTION_LABEL,
  patientSectionLabel,
  SECTION_ALIASES,
  detectSectionFromHeader,
  detectSectionFromRoom,
} from "./patient";

export type {
  Section,
  PatientSection,
  GoalsOfCare,
  SexAtBirth,
  PatientClinicalMeta,
  PatientSyncMeta,
  PatientPhotoRef,
  Urgency,
  TaskCategory,
  TaskSource,
  Task,
  PatientEntry,
  LabEntry,
  PatientPhoto,
  WardEvent,
} from "./patient";
