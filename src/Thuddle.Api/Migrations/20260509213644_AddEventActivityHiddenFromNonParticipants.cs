using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventActivityHiddenFromNonParticipants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HiddenFromNonParticipants",
                table: "EventActivities",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "EventActivityWaitlistEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    JoinedWaitlistAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EventActivityWaitlistEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EventActivityWaitlistEntries_EventActivities_EventActivityId",
                        column: x => x.EventActivityId,
                        principalTable: "EventActivities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_EventActivityWaitlistEntries_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EventActivityWaitlistEntries_EventActivityId_UserId",
                table: "EventActivityWaitlistEntries",
                columns: new[] { "EventActivityId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EventActivityWaitlistEntries_UserId",
                table: "EventActivityWaitlistEntries",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EventActivityWaitlistEntries");

            migrationBuilder.DropColumn(
                name: "HiddenFromNonParticipants",
                table: "EventActivities");
        }
    }
}
