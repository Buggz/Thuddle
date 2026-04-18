using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventCurrencyAndAuctions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Events",
                type: "text",
                nullable: false,
                defaultValue: "EUR");

            migrationBuilder.CreateTable(
                name: "EventAuctionSettings",
                columns: table => new
                {
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    StartsAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LatestEndsAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SealedEndsAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VeiledCloseWindow = table.Column<TimeSpan>(type: "interval", nullable: false),
                    SubmissionMode = table.Column<int>(type: "integer", nullable: false),
                    ItemModerationPolicy = table.Column<int>(type: "integer", nullable: false),
                    MinBidIncrement = table.Column<decimal>(type: "numeric", nullable: false),
                    AllowBuyout = table.Column<bool>(type: "boolean", nullable: false),
                    AnonymousBidHistory = table.Column<bool>(type: "boolean", nullable: false),
                    EndingSoon15MinNotifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndingSoon1MinNotifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventAuctionSettings", x => x.EventId);
                    table.ForeignKey(
                        name: "FK_EventAuctionSettings_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AuctionItemSubmitters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionItemSubmitters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionItemSubmitters_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionItemSubmitters_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: true),
                    EntityId = table.Column<Guid>(type: "uuid", nullable: true),
                    Message = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Notifications_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // AuctionItems created before AuctionBids due to FK dependency,
            // but CurrentBidId FK added separately after AuctionBids table exists.
            migrationBuilder.CreateTable(
                name: "AuctionItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmittedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    StartingBid = table.Column<decimal>(type: "numeric", nullable: false),
                    BuyoutPrice = table.Column<decimal>(type: "numeric", nullable: true),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CurrentBidId = table.Column<Guid>(type: "uuid", nullable: true),
                    WinnerUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    FinalPrice = table.Column<decimal>(type: "numeric", nullable: true),
                    ClaimedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionItems_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionItems_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionItems_Users_WinnerUserId",
                        column: x => x.WinnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "AuctionBids",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    BidderUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    IsBuyout = table.Column<bool>(type: "boolean", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionBids", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionBids_AuctionItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "AuctionItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionBids_Users_BidderUserId",
                        column: x => x.BidderUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AuctionItemImages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlobUrl = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionItemImages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionItemImages_AuctionItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "AuctionItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Now add the CurrentBidId FK (circular: AuctionItems ↔ AuctionBids)
            migrationBuilder.AddForeignKey(
                name: "FK_AuctionItems_AuctionBids_CurrentBidId",
                table: "AuctionItems",
                column: "CurrentBidId",
                principalTable: "AuctionBids",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            // Indexes — AuctionItemSubmitters
            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemSubmitters_UserId",
                table: "AuctionItemSubmitters",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemSubmitters_EventId_UserId",
                table: "AuctionItemSubmitters",
                columns: new[] { "EventId", "UserId" },
                unique: true);

            // Indexes — AuctionItems
            migrationBuilder.CreateIndex(
                name: "IX_AuctionItems_CurrentBidId",
                table: "AuctionItems",
                column: "CurrentBidId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItems_SubmittedByUserId",
                table: "AuctionItems",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItems_WinnerUserId",
                table: "AuctionItems",
                column: "WinnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItems_EventId_Status",
                table: "AuctionItems",
                columns: new[] { "EventId", "Status" });

            // Indexes — AuctionItemImages
            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemImages_ItemId_SortOrder",
                table: "AuctionItemImages",
                columns: new[] { "ItemId", "SortOrder" });

            // Indexes — AuctionBids
            migrationBuilder.CreateIndex(
                name: "IX_AuctionBids_ItemId_Amount",
                table: "AuctionBids",
                columns: new[] { "ItemId", "Amount" },
                unique: true,
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionBids_BidderUserId_CreatedAt",
                table: "AuctionBids",
                columns: new[] { "BidderUserId", "CreatedAt" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionBids_ItemId_IdempotencyKey",
                table: "AuctionBids",
                columns: new[] { "ItemId", "IdempotencyKey" },
                unique: true);

            // Indexes — Notifications
            migrationBuilder.CreateIndex(
                name: "IX_Notifications_RecipientUserId_ReadAt_CreatedAt",
                table: "Notifications",
                columns: new[] { "RecipientUserId", "ReadAt", "CreatedAt" },
                descending: new[] { false, false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Break circular FK before dropping tables
            migrationBuilder.DropForeignKey(
                name: "FK_AuctionItems_AuctionBids_CurrentBidId",
                table: "AuctionItems");

            migrationBuilder.DropTable(name: "AuctionBids");
            migrationBuilder.DropTable(name: "AuctionItemImages");
            migrationBuilder.DropTable(name: "AuctionItems");
            migrationBuilder.DropTable(name: "AuctionItemSubmitters");
            migrationBuilder.DropTable(name: "EventAuctionSettings");
            migrationBuilder.DropTable(name: "Notifications");

            migrationBuilder.DropColumn(name: "Currency", table: "Events");
        }
    }
}
