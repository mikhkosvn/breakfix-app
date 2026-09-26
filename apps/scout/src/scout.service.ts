import { Injectable } from '@nestjs/common';

@Injectable()
export class ScoutService {
  getHello(): string {
    return 'Hello World!';
  }
}
