import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import Redis from 'ioredis';

@Injectable()
export class QuotaResetService {
  private readonly logger = new Logger(QuotaResetService.name);
  private readonly redis: Redis;
  private readonly TIMEZONE = 'Asia/Kolkata';

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6375),
    });
  }

  // Runs every day at midnight IST
  @Cron('30 18 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async resetDailyQuota() {
    const nowIST = toZonedTime(new Date(), this.TIMEZONE);
    const todayString = format(nowIST, 'yyyy-MM-dd');

    this.logger.log(
      `Running daily quota reset at midnight IST (${todayString})`,
    );

    try {
      // Get all quota keys
      const keys = await this.redis.keys('discount_quota:*');

      if (keys.length === 0) {
        this.logger.log('No quota keys found to clean up.');
        return;
      }

      // Delete all keys that are NOT today's date
      const keysToDelete = keys.filter((key) => !key.includes(todayString));

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.logger.log(
          `Deleted ${keysToDelete.length} old quota keys: ${keysToDelete.join(', ')}`,
        );
      } else {
        this.logger.log('No old quota keys to delete.');
      }
    } catch (error) {
      this.logger.error(`Error during quota reset: ${error}`);
    }
  }
}
