import { randomUUID } from "node:crypto";

import type { MemoryDraft, MemoryProposal, MemoryProposalRequest, MemoryRecord } from "@arc/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { MemoryProposalNotFoundError, MemoryProposalStateError } from "../domain/memory.errors.js";
import { MemoryService } from "./memory.service.js";

interface StoredMemoryProposal {
  readonly proposal: MemoryProposal;
}

@Injectable()
export class MemoryProposalService {
  private readonly proposals = new Map<string, StoredMemoryProposal>();

  public constructor(@Inject(MemoryService) private readonly memories: MemoryService) {}

  public propose(input: {
    readonly projectId: string | undefined;
    readonly request: MemoryProposalRequest;
    readonly requestId: string;
    readonly sessionId: string;
  }): MemoryProposal {
    const candidate: MemoryDraft = {
      ...input.request,
      ...(input.request.scope === "project" && input.projectId !== undefined ? { projectId: input.projectId } : {}),
    };
    const now = new Date().toISOString();
    const proposal: MemoryProposal = {
      candidate,
      createdAt: now,
      id: randomUUID(),
      memoryId: null,
      requestId: input.requestId,
      sessionId: input.sessionId,
      status: "pending",
      updatedAt: now,
    };
    this.proposals.set(proposal.id, { proposal });
    return structuredClone(proposal);
  }

  public get(proposalId: string): MemoryProposal {
    return structuredClone(this.requireProposal(proposalId).proposal);
  }

  public async approve(proposalId: string): Promise<MemoryRecord> {
    const stored = this.requirePendingProposal(proposalId);
    const memory = await this.memories.create(stored.proposal.candidate, "assistant");
    stored.proposal.memoryId = memory.id;
    stored.proposal.status = "approved";
    stored.proposal.updatedAt = new Date().toISOString();
    return memory;
  }

  public reject(proposalId: string): MemoryProposal {
    const stored = this.requirePendingProposal(proposalId);
    stored.proposal.status = "rejected";
    stored.proposal.updatedAt = new Date().toISOString();
    return structuredClone(stored.proposal);
  }

  private requireProposal(proposalId: string): StoredMemoryProposal {
    const proposal = this.proposals.get(proposalId);
    if (proposal === undefined) {
      throw new MemoryProposalNotFoundError(proposalId);
    }
    return proposal;
  }

  private requirePendingProposal(proposalId: string): StoredMemoryProposal {
    const proposal = this.requireProposal(proposalId);
    if (proposal.proposal.status !== "pending") {
      throw new MemoryProposalStateError("This memory proposal is no longer awaiting approval.");
    }
    return proposal;
  }
}
