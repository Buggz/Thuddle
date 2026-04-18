using FluentValidation;

namespace Thuddle.Api.Endpoints;

public sealed class CreateEventRequestValidator : AbstractValidator<CreateEventRequest>
{
    public CreateEventRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Title is required.");
        RuleFor(x => x.Location).NotEmpty().WithMessage("Location is required.");
        RuleFor(x => x.Start).GreaterThanOrEqualTo(DateTime.UtcNow.Date).WithMessage("Start must be today or later.");
        RuleFor(x => x.End).GreaterThan(DateTime.UtcNow).WithMessage("End must be in the future.");
        RuleFor(x => x.End).GreaterThan(x => x.Start).WithMessage("End must be after Start.");
        RuleFor(x => x.Capacity).GreaterThanOrEqualTo(1).WithMessage("Capacity must be at least 1.").When(x => x.Capacity.HasValue);
    }
}

public sealed class UpdateEventRequestValidator : AbstractValidator<UpdateEventRequest>
{
    public UpdateEventRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Title is required.");
        RuleFor(x => x.Location).NotEmpty().WithMessage("Location is required.");
        RuleFor(x => x.Start).GreaterThanOrEqualTo(DateTime.UtcNow.Date).WithMessage("Start must be today or later.");
        RuleFor(x => x.End).GreaterThan(DateTime.UtcNow).WithMessage("End must be in the future.");
        RuleFor(x => x.End).GreaterThan(x => x.Start).WithMessage("End must be after Start.");
        RuleFor(x => x.Capacity).GreaterThanOrEqualTo(1).WithMessage("Capacity must be at least 1.").When(x => x.Capacity.HasValue);
    }
}

public sealed class InviteUsersRequestValidator : AbstractValidator<InviteUsersRequest>
{
    public InviteUsersRequestValidator()
    {
        RuleFor(x => x.Emails).NotEmpty().WithMessage("At least one email is required.");
    }
}
