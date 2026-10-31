// Public surface of the framework-agnostic core.
// NOTHING here may import next/* or react (enforced by the boundary lint rule).
export { generateId, isOpaqueId, ID_LENGTH, ID_PATTERN } from "./ids/generateId";
export {
  verifyClerkToken,
  clerkRemoteKeySet,
  ClerkTokenError,
} from "./auth/verifyClerkToken";
export type {
  VerifiedPrincipal,
  VerifyClerkTokenOptions,
} from "./auth/verifyClerkToken";
export { isProtectedPath, PROTECTED_PREFIXES } from "./auth/session";
export { isStaffRole, STAFF_ROLES } from "./auth/roles";
export type { StaffRole } from "./auth/roles";
export { availableTransitions } from "./orders/availableTransitions";
export type { TransitionRow, ActorContext } from "./orders/availableTransitions";
export { installAdvice, isIos, isIosSafari } from "./pwa/install";
export type { InstallAdvice, InstallContext } from "./pwa/install";
export { tabsForRole, activeTabKey, workspaceFor, mobileTabs } from "./nav/tabs";
export type { Tab, Workspace } from "./nav/tabs";
export { orderActions, primaryAction } from "./orders/actions";
export type { OrderAction, ActionIntent } from "./orders/actions";
export {
  mmToMicrons,
  micronsToMm,
  caratToMct,
  mctToCarat,
  formatMm,
  formatCarat,
  estimateMct,
  estimateDiameterUm,
  specProblems,
  specIsComplete,
} from "./orders/spec";
export type { OrderSpecInput, SpecProblem } from "./orders/spec";
export {
  fileGrantFor,
  grantExplanation,
  REVIEW_KINDS,
  RELEASE_KINDS,
} from "./files/downloadGate";
export type { FileGrant, FileKind, DownloadContext } from "./files/downloadGate";
export { pinFromTap, pinStyle, pinProblems, crowdedPairs, BP_MAX } from "./orders/pins";
export type { Pin } from "./orders/pins";
export { pushMessageFor, isNotificationKind, NOTIFICATION_KINDS } from "./notifications/push";
export type { PushMessage, NotificationKind } from "./notifications/push";
export { briefMinimumMissing, draftProgress, gradeBrief, qualitySummary } from "./orders/briefQuality";
export { briefName, briefRows, productWord } from "./orders/briefRows";
export type { BriefRow } from "./orders/briefRows";
export type { BriefQuality, BriefGap, BriefGrade, BriefContext, BriefSize, GapSeverity, MinimumGap } from "./orders/briefQuality";
export { ORDER_STATUS_META, statusMeta, statusKind } from "./orders/status";
export { friendlyReason } from "./errors/friendly";
export { supportHoursLabel, supportOnline, supportStatusLabel, supportWindow, SUPPORT_DISPLAY_ZONE } from "./support/hours";
export type { StatusTone, StatusMeta, StatusKind } from "./orders/status";
export { buildTimeline, chatMilestones } from "./orders/timeline";
export type { TimelineRawRow, TimelineStep, QcOutcome } from "./orders/timeline";
export {
  sanitizeUpload,
  sanitizeUploadAsync,
  MAX_UPLOAD_BYTES,
  DEFAULT_ALLOWLIST,
  DELIVERABLE_ALLOWLIST,
  VOICE_ALLOWLIST,
  ASYNC_STRIPPABLE_TYPES,
} from "./files/sanitizationGate";
export { slotAccept, slotContentType, SLOT_ACCEPT, attachmentContentType, THREAD_ACCEPT } from "./files/slotTypes";
export type { SlotTypeResult } from "./files/slotTypes";
export {
  stripMetadata,
  stripPng,
  stripJpeg,
  stripStep,
  stripStl,
  isStl,
  STRIPPABLE_TYPES,
} from "./files/metadataStripper";
export type { StripResult } from "./files/metadataStripper";
export type {
  IncomingFile,
  SanitizedFile,
  GateResult,
  GateOptions,
  AsyncStripper,
} from "./files/sanitizationGate";
export { escrowSign, netHeld, ESCROW_KINDS } from "./money/escrowSign";
export type { EscrowKind } from "./money/escrowSign";
export {
  validateBankAccount,
  normalizePan,
  normalizeIfsc,
  normalizeAccountNumber,
  isValidPan,
  isValidIfsc,
  isValidAccountNumber,
  panHolderType,
  maskAccountNumber,
  maskFromLast4,
  maskPan,
  ACCOUNT_TYPES,
  PAN_PATTERN,
  IFSC_PATTERN,
  ACCOUNT_NUMBER_PATTERN,
} from "./payouts/bankAccountIn";
export type {
  AccountType,
  BankAccountInput,
  BankAccountErrors,
  NormalizedBankAccount,
} from "./payouts/bankAccountIn";
export { renderEmail, isEmailTemplate, EMAIL_TEMPLATES } from "./email/templates";
export type { EmailTemplate, EmailPayloads, RenderedEmail } from "./email/templates";
// NOT re-exported here on purpose: core/payments/razorpaySignature imports
// node:crypto, and middleware.ts imports this barrel while running on the EDGE
// runtime, which has no node builtins. Pulling it in here breaks the build.
// Server-side callers import it directly from core/payments/razorpaySignature.
export { payoutBatchCsv, paiseToRupees, csvCell, PAYOUT_CSV_HEADER } from "./payouts/batchCsv";
export type { PayoutBatchRow } from "./payouts/batchCsv";
export { remaining } from "./time/remaining";
export {
  DEFAULT_TIME_ZONE,
  TIME_ZONE_CHOICES,
  TIME_ZONE_COOKIE,
  TIME_ZONE_MANUAL_COOKIE,
  dayKey,
  formatDate,
  formatDateTime,
  formatDay,
  formatDayLabel,
  formatRelative,
  formatTime,
  isTimeZone,
} from "./time/format";
export type { Remaining } from "./time/remaining";
export { clientTab, clientNextStep, clientStepsDone, firstLookHours, whatYouGet, CLIENT_STEPS } from "./orders/clientView";
export type { ClientStepContext } from "./orders/clientView";
export type { ClientTab, ClientStep } from "./orders/clientView";
export { jobTab, isOpenJob, jobState, minutesWord, jobClockDue, qcPayoutPaise, rupeesWord, loadWord } from "./work/view";
export type { JobTab } from "./work/view";
export { staffStage, staffNext, queueRank, STAFF_STAGES, STAGE_LABELS } from "./orders/staffView";
export type { StaffStage, StaffFacts, StaffNext } from "./orders/staffView";
export {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE,
  firstTouchFrom,
  encodeFirstTouch,
  decodeFirstTouch,
  HEARD_ABOUT,
  isHeardAbout,
} from "./analytics/utm";
export type { FirstTouch, HeardAbout } from "./analytics/utm";
export { METALS, METAL_NAMES, grams, gramsWord, weightTable, mmWord } from "./weights/weights";
export type { Metal } from "./weights/weights";
