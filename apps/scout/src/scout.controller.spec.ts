import { Test, TestingModule } from '@nestjs/testing';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';

describe('ScoutController', () => {
  let scoutController: ScoutController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [ScoutController],
      providers: [ScoutService],
    }).compile();

    scoutController = app.get<ScoutController>(ScoutController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(scoutController.getHello()).toBe('Hello World!');
    });
  });
});
