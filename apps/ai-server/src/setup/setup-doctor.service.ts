export interface SetupDoctorCheck {
  readonly id: "chat_model" | "completion_model" | "database" | "embedding_model" | "migrations";
  readonly message: string;
  readonly status: "failed" | "passed" | "skipped";
}

export interface SetupDoctorModelStatus {
  readonly message?: string;
  readonly model: string | null;
  readonly status: string;
}

export interface SetupDoctorDependencies {
  readonly checkDatabase: () => Promise<void>;
  readonly getChatModelStatus: () => Promise<SetupDoctorModelStatus>;
  readonly getCompletionModelStatus: () => Promise<SetupDoctorModelStatus>;
  readonly getEmbeddingModelStatus?: () => Promise<SetupDoctorModelStatus>;
  readonly getPendingMigrations: () => Promise<readonly string[]>;
}

export interface SetupDoctorReport {
  readonly checks: readonly SetupDoctorCheck[];
  readonly ready: boolean;
}

export class SetupDoctorService {
  public constructor(private readonly dependencies: SetupDoctorDependencies) {}

  public async run(): Promise<SetupDoctorReport> {
    const database = await this.checkDatabase();
    const migrations: SetupDoctorCheck =
      database.status === "passed"
        ? await this.checkMigrations()
        : { id: "migrations", message: "Skipped until PostgreSQL is reachable.", status: "skipped" as const };
    const [chatModel, completionModel, embeddingModel] = await Promise.all([
      this.checkRequiredModel("chat_model", "chat", this.dependencies.getChatModelStatus),
      this.checkRequiredModel("completion_model", "completion", this.dependencies.getCompletionModelStatus),
      this.dependencies.getEmbeddingModelStatus === undefined
        ? Promise.resolve({
            id: "embedding_model" as const,
            message: "No embedding model is configured.",
            status: "skipped" as const,
          })
        : this.checkRequiredModel("embedding_model", "embedding", this.dependencies.getEmbeddingModelStatus),
    ]);
    const checks = [database, migrations, chatModel, completionModel, embeddingModel];

    return { checks, ready: checks.every((check) => check.status !== "failed") };
  }

  private async checkDatabase(): Promise<SetupDoctorCheck> {
    try {
      await this.dependencies.checkDatabase();
      return { id: "database", message: "PostgreSQL is reachable.", status: "passed" };
    } catch {
      return { id: "database", message: "PostgreSQL is unavailable. Check ARC_DATABASE_URL.", status: "failed" };
    }
  }

  private async checkMigrations(): Promise<SetupDoctorCheck> {
    try {
      const pending = await this.dependencies.getPendingMigrations();
      return pending.length === 0
        ? { id: "migrations", message: "Database migrations are current.", status: "passed" }
        : {
            id: "migrations",
            message: `${String(pending.length)} migrations are pending. Run pnpm db:migrate.`,
            status: "failed",
          };
    } catch {
      return { id: "migrations", message: "Could not inspect database migrations.", status: "failed" };
    }
  }

  private async checkRequiredModel(
    id: Extract<SetupDoctorCheck["id"], "chat_model" | "completion_model" | "embedding_model">,
    label: string,
    getStatus: () => Promise<SetupDoctorModelStatus>,
  ): Promise<SetupDoctorCheck> {
    const status = await getStatus();
    return status.status === "ready"
      ? { id, message: `${label} model ${status.model ?? ""} is ready.`.trim(), status: "passed" }
      : {
          id,
          message: status.message ?? `${label} model status is ${status.status}.`,
          status: "failed",
        };
  }
}
