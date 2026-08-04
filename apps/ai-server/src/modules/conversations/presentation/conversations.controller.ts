import {
  ConversationIdSchema,
  CreateConversationSessionRequestSchema,
  ListConversationSessionsQuerySchema,
  RenameConversationSessionRequestSchema,
  type ConversationSession,
  type ConversationSessionSnapshot,
  type ConversationSessionSummary,
} from "@arc/contracts";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { ConversationSessionService } from "../application/conversation-session.service.js";

@Controller("conversations")
export class ConversationsController {
  public constructor(
    @Inject(ConversationSessionService)
    private readonly conversationSessionService: ConversationSessionService,
  ) {}

  @Post()
  public async create(@Body() payload: unknown): Promise<ConversationSession> {
    const request = this.parseBody(CreateConversationSessionRequestSchema, payload);
    return this.conversationSessionService.create(request.title);
  }

  @Get()
  public async list(@Query() query: unknown): Promise<ConversationSessionSummary[]> {
    const parsedQuery = this.parseBody(ListConversationSessionsQuerySchema, query);
    return this.conversationSessionService.list(parsedQuery.limit);
  }

  @Get(":sessionId")
  public async get(@Param("sessionId") sessionId: string): Promise<ConversationSessionSnapshot> {
    const session = await this.conversationSessionService.load(this.parseSessionId(sessionId));
    if (session === undefined) {
      throw new NotFoundException("Arc conversation session was not found.");
    }

    return session;
  }

  @Patch(":sessionId")
  public async rename(@Param("sessionId") sessionId: string, @Body() payload: unknown): Promise<ConversationSession> {
    const request = this.parseBody(RenameConversationSessionRequestSchema, payload);
    const session = await this.conversationSessionService.rename(this.parseSessionId(sessionId), request.title);
    if (session === undefined) {
      throw new NotFoundException("Arc conversation session was not found.");
    }

    return session;
  }

  @Delete(":sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async delete(@Param("sessionId") sessionId: string): Promise<void> {
    const deleted = await this.conversationSessionService.delete(this.parseSessionId(sessionId));
    if (!deleted) {
      throw new NotFoundException("Arc conversation session was not found.");
    }
  }

  private parseSessionId(sessionId: string): string {
    const parsed = ConversationIdSchema.safeParse(sessionId);
    if (!parsed.success) {
      throw new BadRequestException("Arc conversation session ID must be a UUID.");
    }

    return parsed.data;
  }

  private parseBody<TValue>(
    schema: { safeParse(value: unknown): { success: true; data: TValue } | { success: false } },
    value: unknown,
  ): TValue {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc conversation request is invalid.");
    }

    return parsed.data;
  }
}
