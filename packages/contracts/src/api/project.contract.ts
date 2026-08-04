import { z } from "zod";

export const ProjectIdSchema = z.string().uuid();
export const ProjectNameSchema = z.string().trim().min(1).max(120);
export const ProjectRootPathSchema = z.string().min(1).max(4_096);

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  name: ProjectNameSchema,
  rootPath: ProjectRootPathSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RegisterProjectRequestSchema = z.object({
  name: ProjectNameSchema,
  rootPath: ProjectRootPathSchema,
});

export const RegisterProjectResponseSchema = z.object({
  project: ProjectSchema,
  created: z.boolean(),
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type RegisterProjectRequest = z.infer<typeof RegisterProjectRequestSchema>;
export type RegisterProjectResponse = z.infer<typeof RegisterProjectResponseSchema>;
