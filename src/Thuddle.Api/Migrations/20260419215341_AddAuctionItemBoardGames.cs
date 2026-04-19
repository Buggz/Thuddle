using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuctionItemBoardGames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuctionItemBoardGames",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    BggId = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionItemBoardGames", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionItemBoardGames_AuctionItems_ItemId",
                        column: x => x.ItemId,
                        principalTable: "AuctionItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionItemBoardGames_BoardGames_BggId",
                        column: x => x.BggId,
                        principalTable: "BoardGames",
                        principalColumn: "BggId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemBoardGames_BggId",
                table: "AuctionItemBoardGames",
                column: "BggId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemBoardGames_ItemId_BggId",
                table: "AuctionItemBoardGames",
                columns: new[] { "ItemId", "BggId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItemBoardGames_ItemId_SortOrder",
                table: "AuctionItemBoardGames",
                columns: new[] { "ItemId", "SortOrder" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuctionItemBoardGames");
        }
    }
}
