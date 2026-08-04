import {
  MemoryIdSchema,
  MemoryProposalSchema,
  MemoryRecordSchema,
  type MemoryProposal,
  type MemoryRecord,
} from "@arc/contracts";
import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import { MemoryProposalNotFoundError, MemoryProposalStateError } from "../domain/memory.errors.js";
import { MemoryProposalService } from "../application/memory-proposal.service.js";

@Controller("memory-proposals")
export class MemoryProposalsController {
  public constructor(@Inject(MemoryProposalService) private readonly proposals: MemoryProposalService) {}

  @Get(":proposalId")
  public get(@Param("proposalId") proposalIdValue: unknown): MemoryProposal {
    try {
      return MemoryProposalSchema.parse(this.proposals.get(this.parseId(proposalIdValue)));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/approve")
  public async approve(@Param("proposalId") proposalIdValue: unknown): Promise<MemoryRecord> {
    try {
      return MemoryRecordSchema.parse(await this.proposals.approve(this.parseId(proposalIdValue)));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post(":proposalId/reject")
  public reject(@Param("proposalId") proposalIdValue: unknown): MemoryProposal {
    try {
      return MemoryProposalSchema.parse(this.proposals.reject(this.parseId(proposalIdValue)));
    } catch (error) {
      this.mapError(error);
    }
  }

  private parseId(value: unknown): string {
    const parsed = MemoryIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc memory proposal identifier is invalid.");
    }
    return parsed.data;
  }

  private mapError(error: unknown): never {
    if (error instanceof MemoryProposalNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof MemoryProposalStateError) {
      throw new ConflictException(error.message);
    }
    throw error;
  }
}
