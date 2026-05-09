using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventFeatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EventFeatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    FeatureKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EnabledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EnabledByUserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventFeatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventFeatures_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EventFeatures_EventId_FeatureKey",
                table: "EventFeatures",
                columns: new[] { "EventId", "FeatureKey" },
                unique: true);

            // Backfill: every event with at least one non-deleted raffle gets the 'raffles' feature.
            migrationBuilder.Sql("""
                INSERT INTO "EventFeatures" ("Id", "EventId", "FeatureKey", "EnabledAt", "EnabledByUserId")
                SELECT gen_random_uuid(), e."Id", 'raffles', NOW() AT TIME ZONE 'UTC', e."OwnerId"
                FROM "Events" e
                WHERE EXISTS (SELECT 1 FROM "Raffles" r WHERE r."EventId" = e."Id" AND r."DeletedAt" IS NULL)
                  AND NOT EXISTS (SELECT 1 FROM "EventFeatures" ef WHERE ef."EventId" = e."Id" AND ef."FeatureKey" = 'raffles');
                """);

            // Backfill: every event with EventAuctionSettings gets the 'auction' feature.
            migrationBuilder.Sql("""
                INSERT INTO "EventFeatures" ("Id", "EventId", "FeatureKey", "EnabledAt", "EnabledByUserId")
                SELECT gen_random_uuid(), e."Id", 'auction', NOW() AT TIME ZONE 'UTC', e."OwnerId"
                FROM "Events" e
                WHERE EXISTS (SELECT 1 FROM "EventAuctionSettings" s WHERE s."EventId" = e."Id")
                  AND NOT EXISTS (SELECT 1 FROM "EventFeatures" ef WHERE ef."EventId" = e."Id" AND ef."FeatureKey" = 'auction');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EventFeatures");
        }
    }
}
