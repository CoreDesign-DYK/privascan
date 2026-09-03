package com.privascan.app;

import android.content.Context;
import android.media.AudioManager;
import android.media.MediaActionSound;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CaptureFeedback")
public class CaptureFeedbackPlugin extends Plugin {
    @PluginMethod
    public void playShutter(PluginCall call) {
        AudioManager audioManager =
            (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        boolean audible =
            audioManager != null &&
            audioManager.getRingerMode() == AudioManager.RINGER_MODE_NORMAL;

        JSObject result = new JSObject();
        result.put("played", audible);
        if (!audible) {
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            MediaActionSound sound = new MediaActionSound();
            sound.load(MediaActionSound.SHUTTER_CLICK);
            sound.play(MediaActionSound.SHUTTER_CLICK);
            new Handler(Looper.getMainLooper()).postDelayed(sound::release, 900);
        });
        call.resolve(result);
    }
}