using System.Net;
using System.Net.Mail;

namespace Thuddle.Api.Services;

public sealed class SmtpEmailSender
{
    private readonly string _host;
    private readonly int _port;
    private readonly string _username;
    private readonly string _password;
    private readonly string _from;

    public SmtpEmailSender(IConfiguration config)
    {
        _host = config["Smtp:Host"] ?? "";
        _port = int.Parse(config["Smtp:Port"] ?? "587");
        _username = config["Smtp:Username"] ?? "";
        _password = config["Smtp:Password"] ?? "";
        _from = config["Smtp:From"] ?? _username;
    }

    public async Task SendEmailAsync(string to, string subject, string htmlBody)
    {
        using var client = new SmtpClient(_host, _port)
        {
            Credentials = new NetworkCredential(_username, _password),
            EnableSsl = true
        };
        var mail = new MailMessage(_from, to, subject, htmlBody)
        {
            IsBodyHtml = true
        };
        await client.SendMailAsync(mail);
    }
}
