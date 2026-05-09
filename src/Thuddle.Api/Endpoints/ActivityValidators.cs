using FluentValidation;

namespace Thuddle.Api.Endpoints;

public sealed class CreateActivityRequestValidator : AbstractValidator<CreateActivityRequest>
{
    public CreateActivityRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Title is required.")
            .MaximumLength(120).WithMessage("Title must not exceed 120 characters.");
        RuleFor(x => x.Description)
            .MaximumLength(50_000).WithMessage("Description must not exceed 50,000 characters.")
            .When(x => x.Description is not null);
        RuleFor(x => x.StartsAt).NotEmpty().WithMessage("StartsAt is required.");
        RuleFor(x => x.EndsAt).GreaterThan(x => x.StartsAt)
            .WithMessage("EndsAt must be after StartsAt.")
            .When(x => x.EndsAt.HasValue);
        RuleFor(x => x.MaxParticipants)
            .InclusiveBetween(1, 9999).WithMessage("MaxParticipants must be between 1 and 9999")
            .When(x => x.MaxParticipants.HasValue);
    }
}

public sealed class UpdateActivityRequestValidator : AbstractValidator<UpdateActivityRequest>
{
    public UpdateActivityRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().WithMessage("Title must not be empty.")
            .MaximumLength(120).WithMessage("Title must not exceed 120 characters.")
            .When(x => x.Title is not null);
        RuleFor(x => x.Description)
            .MaximumLength(50_000).WithMessage("Description must not exceed 50,000 characters.")
            .When(x => x.Description is not null);
        RuleFor(x => x.EndsAt).GreaterThan(x => x.StartsAt!.Value)
            .WithMessage("EndsAt must be after StartsAt.")
            .When(x => x.EndsAt.HasValue && x.StartsAt.HasValue);
        RuleFor(x => x.MaxParticipants)
            .InclusiveBetween(1, 1000).WithMessage("MaxParticipants must be between 1 and 1000.")
            .When(x => x.MaxParticipants.HasValue);
    }
}

