export interface FreeBusyStatusStore {
  lastCheckAt: string | null;
  lastError: string | null;
  errorCount: number;
}

export const freeBusyStatusStore: FreeBusyStatusStore = {
  lastCheckAt: null,
  lastError: null,
  errorCount: 0,
};

export function recordFreeBusySuccess() {
  freeBusyStatusStore.lastCheckAt = new Date().toISOString();
  freeBusyStatusStore.lastError = null;
}

export function recordFreeBusyFailure(errorMsg: string) {
  freeBusyStatusStore.lastCheckAt = new Date().toISOString();
  freeBusyStatusStore.lastError = errorMsg;
  freeBusyStatusStore.errorCount += 1;
}
