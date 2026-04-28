using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class CascadeRaffleDraws : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RaffleDraws_Raffles_RaffleId",
                table: "RaffleDraws");

            migrationBuilder.AddForeignKey(
                name: "FK_RaffleDraws_Raffles_RaffleId",
                table: "RaffleDraws",
                column: "RaffleId",
                principalTable: "Raffles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RaffleDraws_Raffles_RaffleId",
                table: "RaffleDraws");

            migrationBuilder.AddForeignKey(
                name: "FK_RaffleDraws_Raffles_RaffleId",
                table: "RaffleDraws",
                column: "RaffleId",
                principalTable: "Raffles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
