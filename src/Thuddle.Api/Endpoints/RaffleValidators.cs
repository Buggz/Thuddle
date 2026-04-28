using FluentValidation;

namespace Thuddle.Api.Endpoints;

public sealed class CreateRaffleRequestValidator : AbstractValidator<CreateRaffleRequest>
{
    public CreateRaffleRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name is required.")
            .MaximumLength(120).WithMessage("Name must not exceed 120 characters.");
        RuleFor(x => x.PricePerTicket).GreaterThan(0)
            .WithMessage("PricePerTicket must be greater than zero.")
            .When(x => x.PricePerTicket.HasValue);
    }
}

public sealed class UpdateRaffleRequestValidator : AbstractValidator<UpdateRaffleRequest>
{
    public UpdateRaffleRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Name must not be empty.")
            .MaximumLength(120).WithMessage("Name must not exceed 120 characters.")
            .When(x => x.Name is not null);
        RuleFor(x => x.PricePerTicket).GreaterThan(0)
            .WithMessage("PricePerTicket must be greater than zero.")
            .When(x => x.PricePerTicket.HasValue);
    }
}

public sealed class SetTicketsRequestValidator : AbstractValidator<SetTicketsRequest>
{
    public SetTicketsRequestValidator()
    {
        RuleFor(x => x.Tickets)
            .GreaterThanOrEqualTo(0).WithMessage("Tickets must be >= 0.")
            .LessThanOrEqualTo(10_000).WithMessage("Tickets must not exceed 10,000.");
    }
}
