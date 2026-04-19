using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBidTimeExtension : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<TimeSpan>(
                name: "VeiledCloseWindow",
                table: "EventAuctionSettings",
                type: "interval",
                nullable: true,
                oldClrType: typeof(TimeSpan),
                oldType: "interval");

            migrationBuilder.Sql("UPDATE \"EventAuctionSettings\" SET \"VeiledCloseWindow\" = NULL WHERE \"VeiledCloseWindow\" = '00:00:00'");

            migrationBuilder.AddColumn<TimeSpan>(
                name: "BidTimeExtension",
                table: "EventAuctionSettings",
                type: "interval",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BidTimeExtension",
                table: "EventAuctionSettings");

            migrationBuilder.Sql("UPDATE \"EventAuctionSettings\" SET \"VeiledCloseWindow\" = '00:00:00' WHERE \"VeiledCloseWindow\" IS NULL");

            migrationBuilder.AlterColumn<TimeSpan>(
                name: "VeiledCloseWindow",
                table: "EventAuctionSettings",
                type: "interval",
                nullable: false,
                defaultValue: TimeSpan.Zero,
                oldClrType: typeof(TimeSpan),
                oldType: "interval",
                oldNullable: true);
        }
    }
}
