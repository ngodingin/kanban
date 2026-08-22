export type {
  ProjectRepository,
  ProjectStateRecord,
  CardRecord,
  UpdateProjectNameInput,
  ProjectLifecycleInput,
} from "./project/project-repository.ts";

export type { ProjectLifecycleState } from "./project/project-lifecycle.ts";
export {
  resolveProjectLifecycle,
  ProjectNotFoundError,
  ProjectVersionConflictError,
  ProjectInvalidStateError,
} from "./project/project-lifecycle.ts";

export type {
  LifecycleState,
  LifecycleTimestamps,
  RestoreDecision,
} from "./lifecycle/effective-state.ts";
export {
  resolveLifecycleState,
  isActive,
  isArchived,
  isDeleted,
  isEffectivelyOperational,
  evaluateRestore,
} from "./lifecycle/effective-state.ts";

export type {
  MilestoneRepository,
  MilestoneRecord,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  MilestoneLifecycleInput,
} from "./milestone/milestone-repository.ts";
export {
  MilestoneNotFoundError,
  MilestoneVersionConflictError,
  MilestoneInvalidStateError,
  AncestorNotActiveError,
  MilestoneValidationError,
} from "./milestone/milestone-errors.ts";
