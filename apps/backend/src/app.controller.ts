import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Health check
  @ApiOperation({ summary: 'Backend health check' })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
