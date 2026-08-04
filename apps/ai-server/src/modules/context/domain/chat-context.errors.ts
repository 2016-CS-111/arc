export class ChatContextWindowExceededError extends Error {
  public constructor() {
    super("The current chat message exceeds Arc's configured model input budget.");
    this.name = "ChatContextWindowExceededError";
  }
}
