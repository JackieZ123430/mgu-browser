// Windows-only current-user key wrapping. No arguments or files contain plaintext keys.
using System;
using System.Security.Cryptography;
using System.Text;
class BrowserDataProtection {
    static int Main() {
        try {
            string operation=Console.ReadLine(), encoded=Console.ReadLine();
            if(encoded==null || encoded.Length>16384)return 1;
            byte[] data=Convert.FromBase64String(encoded), entropy=Encoding.UTF8.GetBytes("MGU Browser local key v1");
            byte[] result;
            if(operation=="protect")result=ProtectedData.Protect(data,entropy,DataProtectionScope.CurrentUser);
            else if(operation=="unprotect")result=ProtectedData.Unprotect(data,entropy,DataProtectionScope.CurrentUser);
            else return 1;
            Console.WriteLine(Convert.ToBase64String(result));Array.Clear(data,0,data.Length);return 0;
        } catch {Console.Error.WriteLine("Windows protected storage is unavailable");return 1;}
    }
}
