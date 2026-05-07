using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventFeatureUserFkAndIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_EventFeatures_EnabledByUserId",
                table: "EventFeatures",
                column: "EnabledByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EventFeatures_EventId",
                table: "EventFeatures",
                column: "EventId");

            migrationBuilder.AddForeignKey(
                name: "FK_EventFeatures_Users_EnabledByUserId",
                table: "EventFeatures",
                column: "EnabledByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EventFeatures_Users_EnabledByUserId",
                table: "EventFeatures");

            migrationBuilder.DropIndex(
                name: "IX_EventFeatures_EnabledByUserId",
                table: "EventFeatures");

            migrationBuilder.DropIndex(
                name: "IX_EventFeatures_EventId",
                table: "EventFeatures");
        }
    }
}
