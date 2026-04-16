using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscussionReadReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscussionReadReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    LastReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscussionReadReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscussionReadReceipts_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_DiscussionReadReceipts_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReadReceipts_EventId",
                table: "DiscussionReadReceipts",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_DiscussionReadReceipts_UserId_EventId",
                table: "DiscussionReadReceipts",
                columns: new[] { "UserId", "EventId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscussionReadReceipts");
        }
    }
}
