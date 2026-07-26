import {
  CheckProjectPathRequestSchema,
  ProjectIdSchema,
  RegisterProjectRequestSchema,
  type CheckProjectPathRequest,
  type ProjectIgnoreDecision,
  type RegisterProjectRequest,
  type RegisterProjectResponse,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from "@nestjs/common";

import { ProjectIgnorePolicyService } from "../application/project-ignore-policy.service.js";
import { ProjectRegistrationService } from "../application/project-registration.service.js";
import {
  IgnoreRulesFileTooLargeError,
  InvalidProjectPathError,
  InvalidProjectRootError,
  ProjectNotFoundError,
} from "../domain/project.errors.js";

@Controller("projects")
export class ProjectsController {
  public constructor(
    @Inject(ProjectRegistrationService)
    private readonly projectRegistrationService: ProjectRegistrationService,
    @Inject(ProjectIgnorePolicyService)
    private readonly projectIgnorePolicyService: ProjectIgnorePolicyService,
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

  @Post(":projectId/ignore/check")
  public async checkIgnore(
    @Param("projectId") projectIdValue: unknown,
    @Body() payload: unknown,
  ): Promise<ProjectIgnoreDecision> {
    const projectId = this.parseProjectId(projectIdValue);
    const request = this.parseIgnoreRequest(payload);

    try {
      return await this.projectIgnorePolicyService.check(projectId, request);
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidProjectPathError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof IgnoreRulesFileTooLargeError) {
        throw new UnprocessableEntityException(error.message);
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

  private parseProjectId(value: unknown): string {
    const parsed = ProjectIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc project identifier is invalid.");
    }

    return parsed.data;
  }

  private parseIgnoreRequest(payload: unknown): CheckProjectPathRequest {
    const parsed = CheckProjectPathRequestSchema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException("Arc project ignore request is invalid.");
    }

    return parsed.data;
  }
}
