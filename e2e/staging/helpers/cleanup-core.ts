export interface CleanupResult {
  signOutStatus: number;
  sessionAfterSignOut: boolean;
}

export function assertCleanupSuccess(result: CleanupResult): void {
  if (result.signOutStatus !== 200) {
    throw new Error(
      `Cleanup gagal: sign-out mengembalikan ${result.signOutStatus}, diharapkan 200`,
    );
  }
  if (result.sessionAfterSignOut) {
    throw new Error(
      "Cleanup gagal: session masih aktif setelah sign-out",
    );
  }
}
