import { ProjectSchema, type Project } from "@arc/contracts";

export interface WorkspaceStatePort {
  get(key: string): unknown;
  update(key: string, value: unknown): Thenable<void>;
}

type StoredProjects = Record<string, unknown>;

export class WorkspaceProjectStore {
  private static readonly stateKey = "arc.registeredProjects";

  public constructor(private readonly workspaceState: WorkspaceStatePort) {}

  public get(workspaceKey: string): Project | undefined {
    const storedValue = this.workspaceState.get(WorkspaceProjectStore.stateKey);
    const projects = isStoredProjects(storedValue) ? storedValue : {};
    const parsed = ProjectSchema.safeParse(projects[workspaceKey]);
    return parsed.success ? parsed.data : undefined;
  }

  public async save(workspaceKey: string, project: Project): Promise<void> {
    const storedValue = this.workspaceState.get(WorkspaceProjectStore.stateKey);
    const projects = isStoredProjects(storedValue) ? storedValue : {};
    await this.workspaceState.update(WorkspaceProjectStore.stateKey, {
      ...projects,
      [workspaceKey]: ProjectSchema.parse(project),
    });
  }
}

function isStoredProjects(value: unknown): value is StoredProjects {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
