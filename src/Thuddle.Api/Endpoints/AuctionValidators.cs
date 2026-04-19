using FluentValidation;

namespace Thuddle.Api.Endpoints;

public sealed class UpdateAuctionSettingsRequestValidator : AbstractValidator<UpdateAuctionSettingsRequest>
{
    public UpdateAuctionSettingsRequestValidator()
    {
        RuleFor(x => x.StartsAt).NotNull().WithMessage("StartsAt is required.");
        RuleFor(x => x.LatestEndsAt).NotNull().WithMessage("LatestEndsAt is required.");
        RuleFor(x => x.LatestEndsAt).GreaterThan(x => x.StartsAt).WithMessage("LatestEndsAt must be after StartsAt.");
        RuleFor(x => x.VeiledCloseWindow).Must(v => v!.Value > TimeSpan.Zero)
            .WithMessage("VeiledCloseWindow must be greater than zero when enabled.")
            .When(x => x.VeiledCloseWindow.HasValue);
        RuleFor(x => x.VeiledCloseWindow).Must((req, vcw) =>
        {
            if (!req.StartsAt.HasValue || !req.LatestEndsAt.HasValue) return true;
            var maxWindow = (req.LatestEndsAt.Value - req.StartsAt.Value) / 2;
            return vcw!.Value <= maxWindow;
        }).WithMessage("VeiledCloseWindow must be at most half the auction duration.")
            .When(x => x.VeiledCloseWindow.HasValue);
        RuleFor(x => x.BidTimeExtension).Must(v => v!.Value > TimeSpan.Zero)
            .WithMessage("BidTimeExtension must be greater than zero when enabled.")
            .When(x => x.BidTimeExtension.HasValue);
        RuleFor(x => x.BidTimeExtension).Must(v => v!.Value <= TimeSpan.FromMinutes(30))
            .WithMessage("BidTimeExtension must be at most 30 minutes.")
            .When(x => x.BidTimeExtension.HasValue);
        RuleFor(x => x.MinBidIncrement).GreaterThan(0).WithMessage("MinBidIncrement must be greater than zero.");
    }
}

public sealed class CreateAuctionItemRequestValidator : AbstractValidator<CreateAuctionItemRequest>
{
    public CreateAuctionItemRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.StartingBid).GreaterThan(0).WithMessage("StartingBid must be greater than zero.");
        RuleFor(x => x.BuyoutPrice).GreaterThan(x => x.StartingBid)
            .WithMessage("BuyoutPrice must be greater than StartingBid.")
            .When(x => x.BuyoutPrice.HasValue);
        RuleFor(x => x.ExtraBggIds)
            .Must(ids => ids is null || ids.Count <= 20)
            .WithMessage("A package can contain at most 20 extra games.");
    }
}

public sealed class UpdateAuctionItemRequestValidator : AbstractValidator<UpdateAuctionItemRequest>
{
    public UpdateAuctionItemRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.");
        RuleFor(x => x.StartingBid).GreaterThan(0).WithMessage("StartingBid must be greater than zero.");
        RuleFor(x => x.BuyoutPrice).GreaterThan(x => x.StartingBid)
            .WithMessage("BuyoutPrice must be greater than StartingBid.")
            .When(x => x.BuyoutPrice.HasValue);
        RuleFor(x => x.ExtraBggIds)
            .Must(ids => ids is null || ids.Count <= 20)
            .WithMessage("A package can contain at most 20 extra games.");
    }
}

public sealed class PlaceBidRequestValidator : AbstractValidator<PlaceBidRequest>
{
    public PlaceBidRequestValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0).WithMessage("Amount must be greater than zero.");
        RuleFor(x => x.IdempotencyKey).NotEmpty().WithMessage("IdempotencyKey is required.");
    }
}
