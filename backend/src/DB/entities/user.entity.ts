import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Project } from './project.entity';
import type { CopyrightSettings } from '../../content/copyright';
import type { TocSettings } from '../../content/table-of-contents';
import type { FontSettings } from '../../content/book-fonts';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column()
  password: string;

  // This account's copyright page details, used on every book it makes
  @Column({ type: 'jsonb', nullable: true })
  copyright: CopyrightSettings | null;

  // This account's table of contents format, used on every book it makes
  @Column({ type: 'jsonb', nullable: true })
  tableOfContents: TocSettings | null;

  // This account's heading and body fonts, copied onto every book it makes
  @Column({ type: 'jsonb', nullable: true })
  fonts: FontSettings | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];
}