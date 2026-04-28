using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRaffles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Raffles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    PricePerTicket = table.Column<decimal>(type: "numeric", nullable: true),
                    SelfReportingEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Raffles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Raffles_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RaffleDraws",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RaffleId = table.Column<Guid>(type: "uuid", nullable: false),
                    WinnerUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DrawnAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TicketsBefore = table.Column<int>(type: "integer", nullable: false),
                    TicketsAfter = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaffleDraws", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaffleDraws_Raffles_RaffleId",
                        column: x => x.RaffleId,
                        principalTable: "Raffles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RaffleDraws_Users_WinnerUserId",
                        column: x => x.WinnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RaffleEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RaffleId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Tickets = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaffleEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaffleEntries_Raffles_RaffleId",
                        column: x => x.RaffleId,
                        principalTable: "Raffles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RaffleEntries_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RaffleDraws_RaffleId",
                table: "RaffleDraws",
                column: "RaffleId");

            migrationBuilder.CreateIndex(
                name: "IX_RaffleDraws_WinnerUserId",
                table: "RaffleDraws",
                column: "WinnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_RaffleEntries_RaffleId_UserId",
                table: "RaffleEntries",
                columns: new[] { "RaffleId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RaffleEntries_UserId",
                table: "RaffleEntries",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Raffles_EventId",
                table: "Raffles",
                column: "EventId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RaffleDraws");

            migrationBuilder.DropTable(
                name: "RaffleEntries");

            migrationBuilder.DropTable(
                name: "Raffles");
        }
    }
}
