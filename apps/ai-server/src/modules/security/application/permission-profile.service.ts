import type { PermissionProfile } from "@arc/contracts";

export class PermissionProfileService {
  public constructor(private readonly profile: PermissionProfile) {}

  public allowsProposalStaging(): boolean {
    return this.profile === "review";
  }

  public getProfile(): PermissionProfile {
    return this.profile;
  }

  public assertProposalStaging(): void {
    if (!this.allowsProposalStaging()) {
      throw new PermissionProfileError();
    }
  }
}

export class PermissionProfileError extends Error {
  public constructor() {
    super("Arc is running with the read-only permission profile.");
  }
}
