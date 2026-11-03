import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../DB/entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  buildCopyrightPage,
  COPYRIGHT_SECTIONS,
  CopyrightSettings,
  defaultWording,
  normalizeCopyrightSettings,
} from '../content/copyright';
import {
  buildTableOfContents,
  defaultTocSettings,
  normalizeTocSettings,
  TOC_SECTIONS,
  TocChapterInput,
  TocSettings,
} from '../content/table-of-contents';
import {
  defaultFontSettings,
  describeFontOptions,
  FontSettings,
  normalizeFontSettings,
} from '../content/book-fonts';

const TOC_PREVIEW_CHAPTERS: TocChapterInput[] = [
  {
    chapterTitle: 'Before the Search',
    sections: [
      { sectionTitle: 'A Small Town', subsections: ['The Last Shift', 'The First Call'] },
      { sectionTitle: 'The First Days', subsections: ['A Second Witness'] },
    ],
  },
  {
    chapterTitle: 'Before the Court',
    sections: [
      { sectionTitle: 'The Evidence', subsections: ['The Phone Records'] },
      { sectionTitle: 'The Verdict', subsections: [] },
    ],
  },
  {
    chapterTitle: 'Where It Stands',
    sections: [{ sectionTitle: 'What Remains Open', subsections: ['A Change in the Law'] }],
  },
];

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return await this.userRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      relations: ['projects'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['projects'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    Object.assign(user, updateUserDto);
    return await this.userRepository.save(user);
  }

  async getCopyright(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'name', 'copyright'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const settings = normalizeCopyrightSettings(user.copyright);
    return {
      settings,
      sections: COPYRIGHT_SECTIONS,
      // The option each section uses when the account hasn't picked one
      defaults: defaultWording(user.id),
      preview: this.copyrightPreview(user, settings),
    };
  }

  /** Renders unsaved settings so the form can show the page as you edit */
  async previewCopyright(id: string, settings: CopyrightSettings) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'name'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return { preview: this.copyrightPreview(user, settings) };
  }

  // Sample page with placeholders for the per-book details
  private copyrightPreview(user: User, settings: CopyrightSettings) {
    return buildCopyrightPage({
      seed: user.id,
      author: user.name || '[Author name]',
      subject: '[Case covered by the book]',
      year: new Date().getFullYear(),
      settings,
    });
  }

  async updateCopyright(id: string, settings: CopyrightSettings) {
    const normalized = normalizeCopyrightSettings(settings);
    const result = await this.userRepository.update(id, {
      copyright: Object.keys(normalized).length ? normalized : null,
    });

    if (!result.affected) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.getCopyright(id);
  }

  async getTableOfContents(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'tableOfContents'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const settings = normalizeTocSettings(user.tableOfContents);
    return {
      settings,
      sections: TOC_SECTIONS,
      // The option each part uses when the account hasn't picked one
      defaults: defaultTocSettings(user.id),
      preview: this.tableOfContentsPreview(user.id, settings),
    };
  }

  /** Renders unsaved settings so the form can show the page as you edit */
  async previewTableOfContents(id: string, settings: TocSettings) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return { preview: this.tableOfContentsPreview(user.id, settings) };
  }

  // Sample contents page; real books use their own outline
  private tableOfContentsPreview(seed: string, settings: TocSettings) {
    return buildTableOfContents({
      seed,
      settings,
      chapters: TOC_PREVIEW_CHAPTERS,
    });
  }

  async updateTableOfContents(id: string, settings: TocSettings) {
    const normalized = normalizeTocSettings(settings);
    const result = await this.userRepository.update(id, {
      tableOfContents: Object.keys(normalized).length ? normalized : null,
    });

    if (!result.affected) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.getTableOfContents(id);
  }

  async getFonts(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'fonts'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return {
      settings: normalizeFontSettings(user.fonts),
      sections: describeFontOptions(),
      // The font each role uses when the account hasn't picked one
      defaults: defaultFontSettings(user.id),
    };
  }

  async updateFonts(id: string, settings: FontSettings) {
    const normalized = normalizeFontSettings(settings);
    const result = await this.userRepository.update(id, {
      fonts: Object.keys(normalized).length ? normalized : null,
    });

    if (!result.affected) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.getFonts(id);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async getUserProjects(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        'projects',
        'projects.images',
        'projects.translations',
        'projects.documents',
      ],
      order: {
        projects: {
          createdAt: 'DESC',
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user.projects;
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password') // Explicitly select password
      .where('user.email = :email', { email })
      .getOne();
  }
}
