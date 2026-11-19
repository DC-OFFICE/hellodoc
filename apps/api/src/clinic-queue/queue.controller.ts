import {
  Body,
  Controller,
  Get,
  Header,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable, filter, map } from 'rxjs';
import { CurrentSession, Public, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { ClinicContextService } from '../clinic-context/clinic-context.service.js';
import { NotificationsService } from '../clinic-notifications/notifications.service.js';
import { CloseSessionDto, DelaySessionDto, ReasonDto, RequiredReasonDto } from './dto/queue.dto.js';
import { QueueService } from './queue.service.js';

@Controller()
export class QueueController {
  constructor(
    private readonly queue: QueueService,
    private readonly clinicContext: ClinicContextService,
    private readonly notifications: NotificationsService,
  ) {}

  private async afterQueueProgress(ctx: Awaited<ReturnType<ClinicContextService['resolve']>>, sessionId: string) {
    try {
      await this.notifications.evaluateApproachingForSession(ctx, sessionId);
    } catch {
      /* approaching SMS must never break queue ops */
    }
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Get('clinic/sessions/:id/queue')
  @Header('Cache-Control', 'no-store')
  async board(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.getBoard(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/appointments/:id/check-in')
  async checkIn(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    const board = await this.queue.checkIn(ctx, id);
    await this.afterQueueProgress(ctx, board.session.id);
    return board;
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/queue/call-next')
  async callNext(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    const board = await this.queue.callNext(ctx, id);
    await this.afterQueueProgress(ctx, id);
    return board;
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/recall')
  async recall(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.recall(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/hold')
  async hold(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.hold(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/skip')
  async skip(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredReasonDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.skip(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/restore')
  async restore(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.restore(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/start-turn')
  async startTurn(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.startTurn(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/queue/:id/finish-turn')
  async finishTurn(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    const board = await this.queue.finishTurn(ctx, id);
    await this.afterQueueProgress(ctx, board.session.id);
    return board;
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/open')
  async open(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.openSession(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/pause')
  async pause(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.pauseSession(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/resume')
  async resume(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.resumeSession(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/delay')
  async delay(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DelaySessionDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    const board = await this.queue.delaySession(ctx, id, dto);
    try {
      await this.notifications.enqueueSessionDelay(
        ctx,
        id,
        dto.reason ?? null,
        dto.revisedStartHint ?? null,
      );
    } catch {
      /* delay SMS must never break session ops */
    }
    return board;
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/sessions/:id/close')
  async close(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSessionDto,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.closeSession(ctx, id, dto);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Post('clinic/appointments/:id/tracking-link')
  async trackingLink(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.createTrackingLink(ctx, id);
  }

  @Roles('clinic_manager', 'clinic_receptionist')
  @Sse('clinic/sessions/:id/queue/events')
  async staffEvents(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Observable<MessageEvent>> {
    const ctx = await this.clinicContext.resolveFrontDesk(session);
    return this.queue.hubStream.pipe(
      filter((n) => n.schemaName === ctx.schemaName && n.sessionId === id),
      map((n) => ({
        type: 'queue',
        id: String(n.revision),
        data: { revision: n.revision, eventType: n.eventType, sessionId: n.sessionId },
      })),
    );
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/track/:token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async publicTrack(@Param('token') token: string) {
    const snap = await this.queue.publicTrack(token);
    const { schemaHint: _s, sessionId: _sid, ...safe } = snap as typeof snap & {
      schemaHint?: string;
      sessionId?: string;
    };
    return safe;
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Sse('public/track/:token/events')
  @Header('Cache-Control', 'no-store')
  async publicEvents(@Param('token') token: string): Promise<Observable<MessageEvent>> {
    const snap = await this.queue.publicTrack(token);
    const schemaName = (snap as { schemaHint?: string }).schemaHint;
    const sessionId = (snap as { sessionId?: string }).sessionId;
    return this.queue.hubStream.pipe(
      filter((n) => n.schemaName === schemaName && n.sessionId === sessionId),
      map((n) => ({
        type: 'queue',
        id: String(n.revision),
        data: { revision: n.revision, eventType: n.eventType },
      })),
    );
  }
}
