import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import {
  User,
  Project,
  Image,
  Chapter,
  Translation,
  Document,
  Job,
} from './DB/entities';
import { UserModule } from './auth/user.module';
import { ProjectModule } from './project/project.module';
import { ContentModule } from './content/content.module';
// import { RedisQueueModule } from './DB/config/redis.config';
import { DocumentModule } from './documents/document.module';
import { ImageModule } from './images/image.module';
import { BookGeneratorModule } from './book gen/book-generator.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queues/queues.module';
import { CacheModule } from './queues/cache/cache.module';
import { HealthController } from './health.controller';
import { RlsLockdownService } from './DB/rls-lockdown.service';
import { SchemaPatchService } from './DB/schema-patch.service';
import {
  databaseConnection,
  shouldSynchronize,
} from './config/connections';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        type: 'postgres',
        ...databaseConnection(),
        entities: [User, Project, Image, Chapter, Translation, Document, Job],
        synchronize: shouldSynchronize(),
        logging: false,
      }),
      inject: [ConfigService],
    }),
    EventEmitterModule.forRoot(),
   
    CacheModule,
    QueueModule,

    AuthModule,
    UserModule,
    ProjectModule,
    ContentModule,
    DocumentModule,
    ImageModule,
    BookGeneratorModule,
  ],
  controllers: [HealthController],
  providers: [SchemaPatchService, RlsLockdownService],
})
export class AppModule {}
