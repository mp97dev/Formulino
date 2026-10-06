import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { DslValidatorService } from './dsl-validator.service';
import { GoogleFormsService } from './google-forms.service';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [StatsModule],
  controllers: [FormsController],
  providers: [DslValidatorService, GoogleFormsService],
})
export class FormsModule {}
