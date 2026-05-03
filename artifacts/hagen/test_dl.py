import yt_dlp

# Try to force impersonation
ydl_opts = {
    'outtmpl': 'test_python_dl.mp4',
    'verbose': True,
    # 'impersonate': 'chrome-110:windows-10' # This might be the key if supported
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download(['https://www.tiktok.com/@chefofthepartie/video/7556732933051125014'])
except Exception as e:
    print(e)
