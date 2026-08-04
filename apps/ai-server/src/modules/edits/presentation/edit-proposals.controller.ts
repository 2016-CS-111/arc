import {
  EditProposalSchema,
  EditProposalSelectionSchema,
  type EditProposal,
  type EditProposalSelection,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import { ProjectNotFoundError } from "../../projects/domain/project.errors.js";
import { ProjectEditProposalService } from "../application/project-edit-proposal.service.js";
import {
  EditProposalConflictError,
  EditProposalNotFoundError,
  EditProposalStateError,
} from "../domain/edit-proposal.errors.js";

@Controller("edit-proposals")
export class EditProposalsController {
  public constructor(
    @Inject(ProjectEditProposalService)
    private readonly editProposals: ProjectEditProposalService,
  ) {}

  @Get(":proposalId")
  public get(@Param("proposalId") proposalId: string): EditProposal {
    try {
      return EditProposalSchema.parse(this.editProposals.get(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/approve")
  public async approve(@Param("proposalId") proposalId: string, @Body() body: unknown): Promise<EditProposal> {
    const selection = this.parseSelection(body);
    try {
      return EditProposalSchema.parse(await this.editProposals.approve(proposalId, selection));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/reject")
  public reject(@Param("proposalId") proposalId: string): EditProposal {
    try {
      return EditProposalSchema.parse(this.editProposals.reject(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/undo")
  public async undo(@Param("proposalId") proposalId: string): Promise<EditProposal> {
    try {
      return EditProposalSchema.parse(await this.editProposals.undo(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  private parseSelection(value: unknown): EditProposalSelection {
    const parsed = EditProposalSelectionSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc edit approval is invalid.");
    }
    return parsed.data;
  }

  private mapError(error: unknown): never {
    if (error instanceof EditProposalNotFoundError || error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof EditProposalConflictError || error instanceof EditProposalStateError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}
