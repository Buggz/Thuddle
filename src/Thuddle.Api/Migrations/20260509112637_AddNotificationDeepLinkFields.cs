using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationDeepLinkFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Step 1: add new columns as nullable so existing rows don't violate constraints
            migrationBuilder.AddColumn<string>(
                name: "EntityType",
                table: "Notifications",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SecondaryEntityId",
                table: "Notifications",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Title",
                table: "Notifications",
                type: "text",
                nullable: true);

            // Step 2: backfill Title and EntityType from Kind
            migrationBuilder.Sql("""
                UPDATE "Notifications" SET "Title" = 'You were outbid',               "EntityType" = 'AuctionItem' WHERE "Kind" = 0;
                UPDATE "Notifications" SET "Title" = 'Auction ending soon',            "EntityType" = 'Event',       "EntityId" = COALESCE("EntityId", "EventId") WHERE "Kind" = 1;
                UPDATE "Notifications" SET "Title" = 'You won an auction item',        "EntityType" = 'AuctionItem' WHERE "Kind" = 2;
                UPDATE "Notifications" SET "Title" = 'Auction item pending approval',  "EntityType" = 'AuctionItem' WHERE "Kind" = 3;
                UPDATE "Notifications" SET "Title" = 'Auction item rejected',          "EntityType" = 'AuctionItem' WHERE "Kind" = 4;
                UPDATE "Notifications" SET "Title" = 'Your bid was voided',            "EntityType" = 'AuctionItem' WHERE "Kind" = 5;
                UPDATE "Notifications" SET "Title" = 'You were banned from publishing',"EntityType" = 'Event'       WHERE "Kind" = 6;
                UPDATE "Notifications" SET "Title" = 'You won a raffle',               "EntityType" = 'Raffle'      WHERE "Kind" = 7;
                """);

            // Step 3: make Title NOT NULL now that all rows have a value
            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "Notifications",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EntityType",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "SecondaryEntityId",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "Title",
                table: "Notifications");
        }
    }
}
