import {
  RegisterProjectRequestSchema,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";
import { BadRequestException, Body, Controller, Inject, Post } from "@nestjs/common";

import { ProjectRegistrationService } from "../application/project-registration.service.js";
import { InvalidProjectRootError } from "../domain/project.errors.js";

@Controller("projects")
export class ProjectsController {
  public constructor(
    @Inject(ProjectRegistrationService)
    private readonly projectRegistrationService: ProjectRegistrationService,
  ) {}

  @Post("register")
  public async register(@Body() payload: unknown): Promise<RegisterProjectResponse> {
    const request = this.parseRequest(payload);

    try {
      return await this.projectRegistrationService.register(request);
    } catch (error) {
      if (error instanceof InvalidProjectRootError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private parseRequest(payload: unknown): RegisterProjectRequest {
    const parsed = RegisterProjectRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Arc project registration request is invalid.");
    }

    return parsed.data;
  }
}
