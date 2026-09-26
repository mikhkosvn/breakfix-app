import { Module } from '@nestjs/common';
import { OpenCodeService } from './opencode.service';

@Module({
  providers: [OpenCodeService],
  exports: [OpenCodeService],
})
export class OpencodeModule {}
