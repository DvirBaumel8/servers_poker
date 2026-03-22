import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";
import { findFiles } from "../shared/fs-utils";
import * as fs from "fs";
import * as path from "path";

interface EntityInfo {
  file: string;
  tableName: string;
  columns: ColumnInfo[];
  relationships: RelationshipInfo[];
  checks: string[];
  hasIndex: string[];
  uniqueConstraints: string[];
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  hasDefault: boolean;
  isFK: boolean;
  length?: number;
}

interface RelationshipInfo {
  type: "ManyToOne" | "OneToMany" | "OneToOne" | "ManyToMany";
  target: string;
  onDelete?: string;
  joinColumn?: string;
}

interface MigrationInfo {
  file: string;
  tables: string[];
  columns: Map<string, string[]>;
  foreignKeys: string[];
  hasDown: boolean;
}

class DataIntegrityMonster extends BaseMonster {
  private workspaceRoot = process.cwd();
  private entities: EntityInfo[] = [];
  private migrations: MigrationInfo[] = [];
  private entityDir: string;
  private migrationDir: string;
  private dtoDir: string;
  private serviceDir: string;

  constructor() {
    super({
      name: "Data Integrity Monster",
      type: "data-integrity" as any,
      timeout: 60000,
      verbose: true,
    });
    this.entityDir = path.join(this.workspaceRoot, "src/entities");
    this.migrationDir = path.join(this.workspaceRoot, "src/migrations");
    this.dtoDir = path.join(this.workspaceRoot, "src");
    this.serviceDir = path.join(this.workspaceRoot, "src");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.entities = this.parseEntities();
    this.migrations = this.parseMigrations();
    this.log(
      `Loaded ${this.entities.length} entities, ${this.migrations.length} migrations`,
    );
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("\n=== CHECK 1: Foreign Key Integrity ===");
    this.checkForeignKeyIntegrity();

    this.log("\n=== CHECK 2: Cascade/OnDelete Completeness ===");
    this.checkCascadeCompleteness();

    this.log("\n=== CHECK 3: Entity-Migration Column Sync ===");
    this.checkEntityMigrationSync();

    this.log("\n=== CHECK 4: Type Mismatches ===");
    this.checkTypeMismatches();

    this.log("\n=== CHECK 5: Enum Validation ===");
    this.checkEnumValidation();

    this.log("\n=== CHECK 6: Chip/Money Integrity ===");
    this.checkChipIntegrity();

    this.log("\n=== CHECK 7: Missing CHECK Constraints ===");
    this.checkMissingConstraints();

    this.log("\n=== CHECK 8: Transaction Safety (Critical Writes) ===");
    this.checkTransactionSafety();

    this.log("\n=== CHECK 9: DTO Validation Coverage ===");
    this.checkDtoValidation();

    this.log("\n=== CHECK 10: Orphan Risk (Missing FKs in DB) ===");
    this.checkOrphanRisk();

    this.log("\n=== CHECK 11: JSONB Schema Safety ===");
    this.checkJsonbSafety();

    this.log("\n=== CHECK 12: Chip Conservation Invariants ===");
    this.checkChipConservation();
  }

  protected async teardown(): Promise<void> {}

  // ============================================================================
  // CHECK 1: FK columns without @ManyToOne relationships
  // ============================================================================
  private checkForeignKeyIntegrity(): void {
    for (const entity of this.entities) {
      const fkColumns = entity.columns.filter(
        (c) =>
          c.name.endsWith("_id") &&
          c.name !== "id" &&
          c.name !== "server_instance_id" &&
          c.name !== "session_id" &&
          c.name !== "resource_id" &&
          c.name !== "rule_id",
      );

      for (const fkCol of fkColumns) {
        this.recordCheck();
        const hasRelation = entity.relationships.some(
          (r) =>
            r.joinColumn === fkCol.name ||
            (r.type === "ManyToOne" &&
              fkCol.name === this.guessJoinColumn(r.target)),
        );

        if (!hasRelation) {
          this.addFinding({
            category: "BUG",
            severity: "high",
            title: `FK column "${fkCol.name}" on "${entity.tableName}" has no @ManyToOne relationship`,
            description:
              `Column "${fkCol.name}" looks like a foreign key but has no @ManyToOne/@OneToOne decorator. ` +
              `Without a relationship, TypeORM won't enforce referential integrity and orphaned records are possible.`,
            location: { file: entity.file },
            reproducible: true,
            tags: ["data-integrity", "missing-fk", entity.tableName],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 2: @ManyToOne without onDelete
  // ============================================================================
  private checkCascadeCompleteness(): void {
    for (const entity of this.entities) {
      const manyToOnes = entity.relationships.filter(
        (r) => r.type === "ManyToOne",
      );

      for (const rel of manyToOnes) {
        this.recordCheck();
        if (!rel.onDelete) {
          const inMigration = this.migrationHasCascade(
            entity.tableName,
            rel.target,
          );
          if (!inMigration) {
            this.addFinding({
              category: "BUG",
              severity: "medium",
              title: `Missing onDelete on ${entity.tableName} -> ${rel.target}`,
              description:
                `@ManyToOne from "${entity.tableName}" to "${rel.target}" has no onDelete setting ` +
                `and no CASCADE in migrations. Deleting the parent will either fail or leave orphaned records.`,
              location: { file: entity.file },
              reproducible: true,
              tags: ["data-integrity", "cascade", entity.tableName],
            });
            this.recordTest(false);
          } else {
            this.recordTest(true);
          }
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 3: Columns in entity but not in any migration
  // ============================================================================
  private checkEntityMigrationSync(): void {
    const allMigrationContent = this.migrations
      .map((m) => {
        try {
          return fs.readFileSync(
            path.join(this.workspaceRoot, m.file),
            "utf-8",
          );
        } catch {
          return "";
        }
      })
      .join("\n");

    for (const entity of this.entities) {
      for (const col of entity.columns) {
        this.recordCheck();
        const inMigration =
          allMigrationContent.includes(`"${col.name}"`) ||
          allMigrationContent.includes(`'${col.name}'`) ||
          allMigrationContent.includes(`\`${col.name}\``);

        if (!inMigration) {
          this.addFinding({
            category: "BUG",
            severity: "critical",
            title: `Column "${col.name}" on "${entity.tableName}" missing from all migrations`,
            description:
              `Entity defines "${col.name}" but no migration creates this column. ` +
              `Runtime error: "column does not exist" unless DB was created with synchronize:true.`,
            location: { file: entity.file },
            reproducible: true,
            tags: ["data-integrity", "schema-sync", entity.tableName],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 4: Type length mismatches (e.g., varchar(100) referencing varchar(36))
  // ============================================================================
  private checkTypeMismatches(): void {
    const idLengths = new Map<string, number>();
    for (const entity of this.entities) {
      const idCol = entity.columns.find((c) => c.name === "id");
      if (idCol && idCol.length) {
        idLengths.set(entity.tableName, idCol.length);
      }
    }

    for (const entity of this.entities) {
      const fkColumns = entity.columns.filter(
        (c) => c.name.endsWith("_id") && c.name !== "id",
      );

      for (const fkCol of fkColumns) {
        this.recordCheck();
        const targetTable = this.guessTargetTable(fkCol.name);
        const targetIdLength = idLengths.get(targetTable);

        if (targetIdLength && fkCol.length && fkCol.length !== targetIdLength) {
          this.addFinding({
            category: "BUG",
            severity: "high",
            title: `Type mismatch: ${entity.tableName}.${fkCol.name} (varchar(${fkCol.length})) vs ${targetTable}.id (varchar(${targetIdLength}))`,
            description:
              `FK column length doesn't match the target table's PK length. ` +
              `This can cause silent data truncation or join failures.`,
            location: { file: entity.file },
            reproducible: true,
            tags: ["data-integrity", "type-mismatch", entity.tableName],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 5: String enum columns without CHECK constraints or @IsEnum
  // ============================================================================
  private checkEnumValidation(): void {
    const enumColumns = [
      {
        table: "games",
        column: "status",
        values: ["waiting", "running", "finished"],
      },
      {
        table: "tournaments",
        column: "status",
        values: ["registering", "running", "finished", "cancelled"],
      },
      {
        table: "tournaments",
        column: "type",
        values: ["rolling", "scheduled"],
      },
      {
        table: "hands",
        column: "stage",
        values: ["preflop", "flop", "turn", "river", "showdown"],
      },
      {
        table: "actions",
        column: "action_type",
        values: ["fold", "check", "call", "bet", "raise"],
      },
      {
        table: "actions",
        column: "stage",
        values: ["preflop", "flop", "turn", "river"],
      },
      { table: "users", column: "role", values: ["user", "admin"] },
      {
        table: "chip_movements",
        column: "movement_type",
        values: [
          "ante",
          "blind",
          "bet",
          "call",
          "raise",
          "all_in",
          "win",
          "refund",
          "tournament_buyin",
          "tournament_payout",
          "rebuy",
        ],
      },
    ];

    for (const { table, column, values } of enumColumns) {
      this.recordCheck();
      const entity = this.entities.find((e) => e.tableName === table);
      if (!entity) continue;

      const hasCheck = entity.checks.some(
        (c) =>
          c.includes(`"${column}"`) && values.some((v) => c.includes(`'${v}'`)),
      );

      const allMigrationContent = this.migrations
        .map((m) => {
          try {
            return fs.readFileSync(
              path.join(this.workspaceRoot, m.file),
              "utf-8",
            );
          } catch {
            return "";
          }
        })
        .join("\n");
      const hasCheckInMigration =
        allMigrationContent.includes(`"${column}"`) &&
        values.some((v) => allMigrationContent.includes(`'${v}'`));

      if (!hasCheck && !hasCheckInMigration) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "medium",
          title: `Enum column "${table}.${column}" has no CHECK constraint`,
          description:
            `Column "${column}" accepts string values but has no DB-level CHECK constraint to enforce valid values: [${values.join(", ")}]. ` +
            `Invalid values could be inserted via raw SQL, migrations, or direct DB access.`,
          location: { file: entity.file },
          reproducible: true,
          tags: ["data-integrity", "enum-validation", table],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 6: Chip/money columns stored correctly (bigint, non-negative checks)
  // ============================================================================
  private checkChipIntegrity(): void {
    const chipColumns = [
      "amount",
      "balance_before",
      "balance_after",
      "start_chips",
      "end_chips",
      "amount_bet",
      "amount_won",
      "pot",
      "buy_in",
      "starting_chips",
      "small_blind",
      "big_blind",
      "ante",
      "chips",
      "payout",
      "current_bet",
    ];

    for (const entity of this.entities) {
      for (const col of entity.columns) {
        if (!chipColumns.includes(col.name)) continue;
        this.recordCheck();

        if (col.type !== "bigint" && col.type !== "integer") {
          this.addFinding({
            category: "BUG",
            severity: "high",
            title: `Chip column "${entity.tableName}.${col.name}" uses "${col.type}" instead of bigint/integer`,
            description:
              `Monetary/chip values should use bigint or integer to prevent floating-point precision errors. ` +
              `Using "${col.type}" can cause rounding bugs in pot calculations.`,
            location: { file: entity.file },
            reproducible: true,
            tags: ["data-integrity", "chip-precision", entity.tableName],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }

        this.recordCheck();
        const hasNonNegativeCheck = entity.checks.some(
          (c) =>
            c.includes(`"${col.name}"`) &&
            (c.includes(">= 0") || c.includes("> 0")),
        );

        if (
          !hasNonNegativeCheck &&
          !col.nullable &&
          !["ante"].includes(col.name)
        ) {
          this.addFinding({
            category: "CODE_QUALITY",
            severity: "low",
            title: `Chip column "${entity.tableName}.${col.name}" has no non-negative CHECK`,
            description:
              `Chip/money column "${col.name}" should have a CHECK constraint to prevent negative values. ` +
              `Negative chip counts indicate a bug in game logic.`,
            location: { file: entity.file },
            reproducible: true,
            tags: ["data-integrity", "missing-check", entity.tableName],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 7: Entities with FK columns but no CHECK or UNIQUE constraints
  // ============================================================================
  private checkMissingConstraints(): void {
    const expectedUniques: Array<{ table: string; columns: string[] }> = [
      { table: "game_players", columns: ["game_id", "bot_id"] },
      { table: "hand_players", columns: ["hand_id", "bot_id"] },
      { table: "table_seats", columns: ["table_id", "bot_id"] },
      { table: "tournament_seats", columns: ["tournament_id", "bot_id"] },
      { table: "hands", columns: ["game_id", "hand_number"] },
    ];

    for (const { table, columns } of expectedUniques) {
      this.recordCheck();
      const entity = this.entities.find((e) => e.tableName === table);
      if (!entity) continue;

      const hasUnique = entity.uniqueConstraints.some((u) =>
        columns.every((c) => u.includes(c)),
      );

      if (!hasUnique) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Missing unique constraint on ${table}(${columns.join(", ")})`,
          description:
            `Table "${table}" should have a unique constraint on [${columns.join(", ")}] to prevent duplicate records. ` +
            `Without it, a bot could appear twice in the same game/hand/seat.`,
          location: { file: entity?.file || "unknown" },
          reproducible: true,
          tags: ["data-integrity", "unique-constraint", table],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 8: Multi-write operations without transactions
  // ============================================================================
  private checkTransactionSafety(): void {
    const criticalFiles = [
      "src/services/game/game-data-persistence.service.ts",
      "src/modules/tournaments/tournament-director.service.ts",
      "src/services/game/live-game-manager.service.ts",
      "src/modules/games/games.service.ts",
    ];

    for (const relPath of criticalFiles) {
      const fullPath = path.join(this.workspaceRoot, relPath);
      if (!fs.existsSync(fullPath)) continue;
      this.recordCheck();

      const content = fs.readFileSync(fullPath, "utf-8");
      const methods = this.extractMethods(content);

      for (const method of methods) {
        this.recordCheck();
        const writeOps = (
          method.body.match(
            /\.(update|save|insert|increment|delete|remove)\(/g,
          ) || []
        ).length;

        if (writeOps >= 3) {
          const hasTransaction =
            method.body.includes("transaction") ||
            method.body.includes("queryRunner") ||
            method.body.includes("getConnection") ||
            method.body.includes("manager.transaction");

          if (!hasTransaction) {
            this.addFinding({
              category: "BUG",
              severity: "high",
              title: `Method "${method.name}" in ${path.basename(relPath)} has ${writeOps} writes without transaction`,
              description:
                `Method "${method.name}" performs ${writeOps} database write operations without a transaction. ` +
                `If any write fails mid-way, the database will be left in an inconsistent state. ` +
                `This is especially critical for chip/money operations.`,
              location: { file: relPath },
              reproducible: true,
              tags: ["data-integrity", "transaction-safety", "race-condition"],
            });
            this.recordTest(false);
          } else {
            this.recordTest(true);
          }
        }
      }
    }
  }

  // ============================================================================
  // CHECK 9: DTO properties without validation decorators
  // ============================================================================
  private checkDtoValidation(): void {
    const dtoFiles = findFiles(path.join(this.workspaceRoot, "src"), ".dto.ts");

    const inputDtoNames = this.findInputDtoNames();

    const validationDecorators = [
      "@IsString",
      "@IsNumber",
      "@IsInt",
      "@IsBoolean",
      "@IsEmail",
      "@IsUUID",
      "@IsEnum",
      "@IsOptional",
      "@IsNotEmpty",
      "@Min(",
      "@Max(",
      "@MinLength",
      "@MaxLength",
      "@IsIn(",
      "@IsObject",
      "@IsArray",
      "@ValidateNested",
      "@Matches(",
      "@Type(",
      "@IsDateString",
      "@Validate(",
      "@Length(",
      "@Transform(",
    ];

    for (const dtoFile of dtoFiles) {
      const content = fs.readFileSync(dtoFile, "utf-8");
      const relPath = path.relative(this.workspaceRoot, dtoFile);

      const lines = content.split("\n");
      let inClass = false;
      let currentClassName = "";
      let classStartLine = 0;
      let braceDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const classMatch = line.match(/class\s+(\w*Dto\w*)/);
        if (classMatch) {
          inClass = true;
          currentClassName = classMatch[1];
          classStartLine = i;
          braceDepth = 0;
        }

        if (inClass) {
          braceDepth += (line.match(/{/g) || []).length;
          braceDepth -= (line.match(/}/g) || []).length;
          if (braceDepth <= 0 && inClass && i > 0) {
            inClass = false;
            continue;
          }

          if (!inputDtoNames.has(currentClassName)) continue;

          const propMatch = line.match(
            /^\s+(\w+)(\?)?:\s*(string|number|boolean|object|any)/,
          );
          if (propMatch) {
            this.recordCheck();
            const propName = propMatch[1];

            const contextStart = Math.max(classStartLine, i - 15);
            const context = lines.slice(contextStart, i + 1).join("\n");

            const hasValidation = validationDecorators.some((d) =>
              context.includes(d),
            );

            if (!hasValidation) {
              this.addFinding({
                category: "CODE_QUALITY",
                severity: "medium",
                title: `Input DTO "${currentClassName}.${propName}" has no validation`,
                description:
                  `Property "${propName}" in input DTO "${currentClassName}" accepts user input ` +
                  `but has no validation decorator. Unsanitized input could corrupt the database.`,
                location: { file: relPath },
                reproducible: true,
                tags: [
                  "data-integrity",
                  "dto-validation",
                  "input-sanitization",
                ],
              });
              this.recordTest(false);
            } else {
              this.recordTest(true);
            }
          }
        }
      }
    }
  }

  /**
   * Scan all controllers and gateways to find DTO class names used
   * with @Body() or @Query() — these are true input DTOs.
   * Also includes nested DTOs referenced via @ValidateNested/@Type
   * in the identified input DTOs.
   */
  private findInputDtoNames(): Set<string> {
    const controllerFiles = [
      ...findFiles(path.join(this.workspaceRoot, "src"), ".controller.ts"),
      ...findFiles(path.join(this.workspaceRoot, "src"), ".gateway.ts"),
    ];

    const inputDtos = new Set<string>();
    const bodyQueryRegex =
      /@(?:Body|Query)\([^)]*\)\s*\w+(?:\?)?:\s*(\w+Dto\w*)/g;

    for (const file of controllerFiles) {
      const content = fs.readFileSync(file, "utf-8");
      let match;
      while ((match = bodyQueryRegex.exec(content)) !== null) {
        inputDtos.add(match[1]);
      }
    }

    const dtoFiles = findFiles(path.join(this.workspaceRoot, "src"), ".dto.ts");
    const nestedDtoRegex =
      /@ValidateNested\(\)[\s\S]*?@Type\(\(\)\s*=>\s*(\w+Dto\w*)\)/g;

    for (const dtoFile of dtoFiles) {
      const content = fs.readFileSync(dtoFile, "utf-8");

      const classRegex = /class\s+(\w*Dto\w*)/g;
      let classMatch;
      while ((classMatch = classRegex.exec(content)) !== null) {
        const className = classMatch[1];
        if (!inputDtos.has(className)) continue;

        let nestedMatch;
        while ((nestedMatch = nestedDtoRegex.exec(content)) !== null) {
          inputDtos.add(nestedMatch[1]);
        }
        nestedDtoRegex.lastIndex = 0;
      }
    }

    return inputDtos;
  }

  // ============================================================================
  // CHECK 10: FK columns that reference tables but have no FK in migrations
  // ============================================================================
  private checkOrphanRisk(): void {
    const knownOrphanRisks = [
      { table: "chip_movements", column: "game_id", references: "games" },
      { table: "chip_movements", column: "hand_id", references: "hands" },
      {
        table: "chip_movements",
        column: "tournament_id",
        references: "tournaments",
      },
      { table: "game_state_snapshots", column: "game_id", references: "games" },
      {
        table: "game_state_snapshots",
        column: "table_id",
        references: "tables",
      },
      { table: "games", column: "table_id", references: "tables" },
      { table: "games", column: "tournament_id", references: "tournaments" },
      { table: "hands", column: "dealer_bot_id", references: "bots" },
      { table: "audit_logs", column: "user_id", references: "users" },
    ];

    const allMigrationContent = this.migrations
      .map((m) => {
        try {
          return fs.readFileSync(
            path.join(this.workspaceRoot, m.file),
            "utf-8",
          );
        } catch {
          return "";
        }
      })
      .join("\n");

    for (const risk of knownOrphanRisks) {
      this.recordCheck();

      const hasFKInMigration =
        allMigrationContent.includes(`REFERENCES "${risk.references}"`) &&
        allMigrationContent.includes(`"${risk.column}"`);

      const entity = this.entities.find((e) => e.tableName === risk.table);
      const hasRelation = entity?.relationships.some(
        (r) =>
          r.joinColumn === risk.column ||
          (r.type === "ManyToOne" &&
            risk.column === this.guessJoinColumn(r.target)),
      );

      if (!hasFKInMigration && !hasRelation) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Orphan risk: ${risk.table}.${risk.column} has no FK to ${risk.references}`,
          description:
            `Column "${risk.column}" references "${risk.references}" but has no foreign key constraint ` +
            `in the entity or migrations. If a ${risk.references} record is deleted, ` +
            `${risk.table} records will have dangling references causing data corruption.`,
          location: { file: entity?.file || "unknown" },
          reproducible: true,
          tags: ["data-integrity", "orphan-risk", risk.table],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 11: JSONB columns without schema validation
  // ============================================================================
  private checkJsonbSafety(): void {
    for (const entity of this.entities) {
      const jsonbCols = entity.columns.filter((c) => c.type === "jsonb");

      for (const col of jsonbCols) {
        this.recordCheck();
        const isCritical = [
          "strategy",
          "hole_cards",
          "community_cards",
          "best_hand",
          "players",
        ].includes(col.name);

        if (isCritical) {
          const dtoFiles = findFiles(
            path.join(this.workspaceRoot, "src"),
            ".dto.ts",
          );
          const hasSchemaValidation = dtoFiles.some((f) => {
            try {
              const content = fs.readFileSync(f, "utf-8");
              return (
                content.includes(col.name) &&
                (content.includes("@ValidateNested") ||
                  content.includes("@Type(") ||
                  content.includes("@IsArray"))
              );
            } catch {
              return false;
            }
          });

          if (!hasSchemaValidation) {
            this.addFinding({
              category: "CODE_QUALITY",
              severity: "medium",
              title: `Critical JSONB column "${entity.tableName}.${col.name}" has no schema validation`,
              description:
                `JSONB column "${col.name}" stores critical game data but has no DTO validation for its structure. ` +
                `Malformed JSON could corrupt game state and be extremely difficult to debug.`,
              location: { file: entity.file },
              reproducible: true,
              tags: ["data-integrity", "jsonb-schema", entity.tableName],
            });
            this.recordTest(false);
          } else {
            this.recordTest(true);
          }
        }
      }
    }
  }

  // ============================================================================
  // CHECK 12: Chip conservation — sum(amount_won) should equal pot
  // ============================================================================
  private checkChipConservation(): void {
    const files = [
      "src/game/poker-game.service.ts",
      "src/workers/game.worker.ts",
      "src/services/game/live-game-manager.service.ts",
      "src/simulation/simulation-engine.ts",
      "src/game/invariants.ts",
    ];

    const chipConservationPatterns = [
      "totalChips",
      "chipConservation",
      "conservation",
      "sum.*chips",
      "validate.*pot",
    ];

    for (const relPath of files) {
      const fullPath = path.join(this.workspaceRoot, relPath);
      if (!fs.existsSync(fullPath)) continue;
      this.recordCheck();

      const content = fs.readFileSync(fullPath, "utf-8");

      const hasConservationCheck = chipConservationPatterns.some((p) =>
        new RegExp(p, "i").test(content),
      );

      if (!hasConservationCheck && relPath.includes("game")) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "medium",
          title: `No chip conservation validation in ${path.basename(relPath)}`,
          description:
            `File "${relPath}" handles game logic but doesn't validate chip conservation ` +
            `(total chips in = total chips out). Chip leaks or duplications could go undetected.`,
          location: { file: relPath },
          reproducible: true,
          tags: ["data-integrity", "chip-conservation", "game-logic"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.recordCheck();
    const persistenceFile = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (fs.existsSync(persistenceFile)) {
      const content = fs.readFileSync(persistenceFile, "utf-8");
      const hasBalanceValidation =
        content.includes("balance_before") &&
        content.includes("balance_after") &&
        (content.includes("amount") || content.includes("validate"));

      if (!hasBalanceValidation) {
        this.addFinding({
          category: "CODE_QUALITY",
          severity: "medium",
          title:
            "Chip movements not validated: balance_before + amount != balance_after",
          description:
            `The persistence service records chip movements but doesn't validate that ` +
            `balance_before + amount == balance_after. This invariant should be checked before saving.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-integrity", "chip-conservation", "invariant"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // PARSING HELPERS
  // ============================================================================

  private parseEntities(): EntityInfo[] {
    if (!fs.existsSync(this.entityDir)) return [];

    return fs
      .readdirSync(this.entityDir)
      .filter((f) => f.endsWith(".entity.ts") && !f.includes("base.entity"))
      .map((f) => {
        const fullPath = path.join(this.entityDir, f);
        const content = fs.readFileSync(fullPath, "utf-8");
        return this.parseEntity(
          content,
          path.relative(this.workspaceRoot, fullPath),
        );
      })
      .filter((e): e is EntityInfo => e !== null);
  }

  private parseEntity(content: string, file: string): EntityInfo | null {
    const tableMatch = content.match(/@Entity\(["'](\w+)["']\)/);
    if (!tableMatch) return null;

    const tableName = tableMatch[1];
    const columns = this.extractEntityColumns(content);
    const relationships = this.extractRelationships(content);
    const checks = this.extractChecks(content);
    const indexes = this.extractIndexes(content);
    const uniqueConstraints = this.extractUniques(content);

    return {
      file,
      tableName,
      columns,
      relationships,
      checks,
      hasIndex: indexes,
      uniqueConstraints,
    };
  }

  private extractEntityColumns(content: string): ColumnInfo[] {
    const columns: ColumnInfo[] = [];
    const columnRegex = /@Column\(\s*\{([^}]*)\}\s*\)\s*\n\s*(\w+)/g;
    let match;

    while ((match = columnRegex.exec(content)) !== null) {
      const opts = match[1];
      const name = match[2];

      const typeMatch = opts.match(/type:\s*["'](\w[\w\s]*?)["']/);
      const nullableMatch = opts.match(/nullable:\s*(true|false)/);
      const defaultMatch = opts.match(/default:/);
      const lengthMatch = opts.match(/length:\s*(\d+)/);

      columns.push({
        name,
        type: typeMatch ? typeMatch[1].trim() : "unknown",
        nullable: nullableMatch ? nullableMatch[1] === "true" : false,
        hasDefault: !!defaultMatch,
        isFK: name.endsWith("_id") && name !== "id",
        length: lengthMatch ? parseInt(lengthMatch[1]) : undefined,
      });
    }

    return columns;
  }

  private extractRelationships(content: string): RelationshipInfo[] {
    const rels: RelationshipInfo[] = [];
    const relStartRegex = /@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(/g;
    let startMatch;

    while ((startMatch = relStartRegex.exec(content)) !== null) {
      const relType = startMatch[1] as RelationshipInfo["type"];
      const afterStart = content.slice(startMatch.index);

      let depth = 0;
      let endIdx = startMatch[0].length;
      for (let i = startMatch[0].length; i < afterStart.length; i++) {
        if (afterStart[i] === "(") depth++;
        if (afterStart[i] === ")") {
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
          depth--;
        }
      }

      const decoratorBody = afterStart.slice(0, endIdx);
      const targetMatch = decoratorBody.match(/\(\)\s*=>\s*(\w+)/);
      const onDeleteMatch = decoratorBody.match(
        /onDelete:\s*["'](\w[\w ]+)["']/,
      );

      const joinColMatch = content
        .slice(startMatch.index, startMatch.index + 500)
        .match(/@JoinColumn\(\s*\{\s*name:\s*["'](\w+)["']/);

      rels.push({
        type: relType,
        target: targetMatch ? targetMatch[1] : "Unknown",
        onDelete: onDeleteMatch ? onDeleteMatch[1] : undefined,
        joinColumn: joinColMatch ? joinColMatch[1] : undefined,
      });
    }

    return rels;
  }

  private extractChecks(content: string): string[] {
    const checks: string[] = [];
    const checkRegex = /@Check\(`([^`]+)`\)/g;
    let match;
    while ((match = checkRegex.exec(content)) !== null) {
      checks.push(match[1]);
    }
    return checks;
  }

  private extractIndexes(content: string): string[] {
    const indexes: string[] = [];
    const indexRegex = /@Index\(\[([^\]]+)\]/g;
    let match;
    while ((match = indexRegex.exec(content)) !== null) {
      indexes.push(match[1]);
    }
    return indexes;
  }

  private extractUniques(content: string): string[] {
    const uniques: string[] = [];
    const uniqueRegex = /@Unique\(\[([^\]]+)\]/g;
    let match;
    while ((match = uniqueRegex.exec(content)) !== null) {
      uniques.push(match[1]);
    }
    return uniques;
  }

  private parseMigrations(): MigrationInfo[] {
    if (!fs.existsSync(this.migrationDir)) return [];

    return fs
      .readdirSync(this.migrationDir)
      .filter((f) => f.endsWith(".ts") && !f.includes("run."))
      .map((f) => {
        const fullPath = path.join(this.migrationDir, f);
        const relPath = path.relative(this.workspaceRoot, fullPath);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          return this.parseMigration(content, relPath);
        } catch {
          return null;
        }
      })
      .filter((m): m is MigrationInfo => m !== null);
  }

  private parseMigration(content: string, file: string): MigrationInfo {
    const tables: string[] = [];
    const tableRegex = /CREATE TABLE[^"]*"(\w+)"/g;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      tables.push(match[1]);
    }

    const fks: string[] = [];
    const fkRegex = /REFERENCES "(\w+)"/g;
    while ((match = fkRegex.exec(content)) !== null) {
      fks.push(match[1]);
    }

    return {
      file,
      tables,
      columns: new Map(),
      foreignKeys: fks,
      hasDown: content.includes("public async down"),
    };
  }

  private migrationHasCascade(
    sourceTable: string,
    targetEntity: string,
  ): boolean {
    const targetTable = this.entityToTable(targetEntity);
    const allContent = this.migrations
      .map((m) => {
        try {
          return fs.readFileSync(
            path.join(this.workspaceRoot, m.file),
            "utf-8",
          );
        } catch {
          return "";
        }
      })
      .join("\n");

    const tableSection = allContent
      .split(/CREATE TABLE/i)
      .find((s) => s.includes(`"${sourceTable}"`));
    if (!tableSection) return false;

    return (
      tableSection.includes(`REFERENCES "${targetTable}"`) &&
      tableSection.includes("CASCADE")
    );
  }

  private entityToTable(entityName: string): string {
    const mapping: Record<string, string> = {
      Bot: "bots",
      User: "users",
      Game: "games",
      Table: "tables",
      Hand: "hands",
      Tournament: "tournaments",
      GamePlayer: "game_players",
      HandPlayer: "hand_players",
      Action: "actions",
      TournamentEntry: "tournament_entries",
      TournamentTable: "tournament_tables",
      TournamentSeat: "tournament_seats",
      ChipMovement: "chip_movements",
      TableSeat: "table_seats",
    };
    return mapping[entityName] || entityName.toLowerCase() + "s";
  }

  private guessJoinColumn(entityName: string): string {
    const mapping: Record<string, string> = {
      Bot: "bot_id",
      User: "user_id",
      Game: "game_id",
      Table: "table_id",
      Hand: "hand_id",
      Tournament: "tournament_id",
      TournamentTable: "tournament_table_id",
    };
    return mapping[entityName] || entityName.toLowerCase() + "_id";
  }

  private guessTargetTable(fkColumn: string): string {
    const mapping: Record<string, string> = {
      bot_id: "bots",
      user_id: "users",
      game_id: "games",
      table_id: "tables",
      hand_id: "hands",
      tournament_id: "tournaments",
      dealer_bot_id: "bots",
    };
    return mapping[fkColumn] || fkColumn.replace("_id", "s");
  }

  private extractMethods(
    content: string,
  ): Array<{ name: string; body: string }> {
    const methods: Array<{ name: string; body: string }> = [];
    const methodRegex =
      /(?:async\s+)?(?:private|protected|public)\s+(\w+)\s*\([^)]*\)[^{]*\{/g;
    let match;

    const skipNames = new Set([
      "Injectable",
      "Controller",
      "Module",
      "Entity",
      "constructor",
    ]);

    while ((match = methodRegex.exec(content)) !== null) {
      const name = match[1];
      if (skipNames.has(name)) continue;

      const start = match.index + match[0].length;
      let depth = 1;
      let end = start;

      for (let i = start; i < content.length && depth > 0; i++) {
        if (content[i] === "{") depth++;
        if (content[i] === "}") depth--;
        end = i;
      }

      methods.push({ name, body: content.slice(start, end) });
    }

    return methods;
  }
}

runMonsterCli(new DataIntegrityMonster(), "data-integrity");
