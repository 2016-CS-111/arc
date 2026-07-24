export interface WebviewActionOperations {
  readonly openExternal: (url: string) => PromiseLike<boolean>;
  readonly writeClipboard: (content: string) => PromiseLike<void>;
}

export class WebviewActionService {
  public constructor(private readonly operations: WebviewActionOperations) {}

  public async copyCode(content: string): Promise<boolean> {
    if (content.length === 0) {
      return false;
    }

    try {
      await this.operations.writeClipboard(content);
      return true;
    } catch {
      return false;
    }
  }

  public async openExternalUrl(url: string): Promise<boolean> {
    if (!isSafeExternalUrl(url)) {
      return false;
    }

    try {
      return await this.operations.openExternal(url);
    } catch {
      return false;
    }
  }
}

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") && url.username.length === 0 && url.password.length === 0
    );
  } catch {
    return false;
  }
}
