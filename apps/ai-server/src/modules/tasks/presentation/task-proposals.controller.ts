import { TaskProposalSchema, type TaskProposal } from "@arc/contracts";
import { ConflictException, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";

import { TaskProposalService } from "../application/task-proposal.service.js";
import {
  TaskProposalConflictError,
  TaskProposalNotFoundError,
  TaskProposalStateError,
} from "../domain/task-proposal.errors.js";

@Controller("task-proposals")
export class TaskProposalsController {
  public constructor(
    @Inject(TaskProposalService)
    private readonly taskProposals: TaskProposalService,
  ) {}

  @Get(":proposalId")
  public get(@Param("proposalId") proposalId: string): TaskProposal {
    try {
      return TaskProposalSchema.parse(this.taskProposals.get(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/approve")
  public approve(@Param("proposalId") proposalId: string): TaskProposal {
    try {
      return TaskProposalSchema.parse(this.taskProposals.start(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/reject")
  public reject(@Param("proposalId") proposalId: string): TaskProposal {
    try {
      return TaskProposalSchema.parse(this.taskProposals.reject(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/cancel")
  public cancel(@Param("proposalId") proposalId: string): TaskProposal {
    try {
      return TaskProposalSchema.parse(this.taskProposals.cancel(proposalId));
    } catch (error) {
      this.mapError(error);
    }
  }

  private mapError(error: unknown): never {
    if (error instanceof TaskProposalNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof TaskProposalConflictError || error instanceof TaskProposalStateError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}
