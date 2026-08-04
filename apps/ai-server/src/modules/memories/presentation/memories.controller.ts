import {
  CreateMemoryRequestSchema,
  ImportMemoriesRequestSchema,
  ListMemoriesQuerySchema,
  MemoryExportSchema,
  MemoryIdSchema,
  MemoryRecordSchema,
  UpdateMemoryRequestSchema,
  type ListMemoriesQuery,
  type MemoryRecord,
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

import { ProjectNotFoundError } from "../../projects/domain/project.errors.js";
import { MemoryConflictError, MemoryNotFoundError } from "../domain/memory.errors.js";
import { MemoryService } from "../application/memory.service.js";

@Controller("memories")
export class MemoriesController {
  public constructor(@Inject(MemoryService) private readonly memories: MemoryService) {}

  @Get()
  public async list(@Query() query: unknown): Promise<readonly MemoryRecord[]> {
    return MemoryRecordSchema.array().parse(await this.memories.list(this.parseQuery(query)));
  }

  @Get("export")
  public async export(@Query() query: unknown) {
    return MemoryExportSchema.parse(await this.memories.export(this.parseQuery(query)));
  }

  @Post()
  public async create(@Body() body: unknown): Promise<MemoryRecord> {
    try {
      return MemoryRecordSchema.parse(await this.memories.create(this.parseBody(CreateMemoryRequestSchema, body)));
    } catch (error) {
      this.mapError(error);
    }
  }

  @Post("import")
  public async import(@Body() body: unknown): Promise<readonly MemoryRecord[]> {
    try {
      return MemoryRecordSchema.array().parse(
        await this.memories.import(this.parseBody(ImportMemoriesRequestSchema, body)),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Patch(":memoryId")
  public async update(@Param("memoryId") memoryIdValue: unknown, @Body() body: unknown): Promise<MemoryRecord> {
    try {
      return MemoryRecordSchema.parse(
        await this.memories.update(this.parseMemoryId(memoryIdValue), this.parseBody(UpdateMemoryRequestSchema, body)),
      );
    } catch (error) {
      this.mapError(error);
    }
  }

  @Delete(":memoryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async forget(@Param("memoryId") memoryIdValue: unknown): Promise<void> {
    try {
      await this.memories.forget(this.parseMemoryId(memoryIdValue));
    } catch (error) {
      this.mapError(error);
    }
  }

  private parseQuery(value: unknown): ListMemoriesQuery {
    const parsed = ListMemoriesQuerySchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc memory query is invalid.");
    }
    return parsed.data;
  }

  private parseMemoryId(value: unknown): string {
    const parsed = MemoryIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc memory identifier is invalid.");
    }
    return parsed.data;
  }

  private parseBody<TValue>(
    schema: { safeParse(value: unknown): { success: true; data: TValue } | { success: false } },
    value: unknown,
  ): TValue {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Arc memory request is invalid.");
    }
    return parsed.data;
  }

  private mapError(error: unknown): never {
    if (error instanceof MemoryNotFoundError || error instanceof ProjectNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof MemoryConflictError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
